// netlify/functions/delete-photo.js
// Firestore 문서와 GCS 파일을 모두 삭제하는 함수다옹!

const { Storage } = require('@google-cloud/storage');
const admin = require('firebase-admin');

// --- GCS 초기화 (개별 환경 변수 사용) ---
let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images'; // 네 버킷 이름!
const GCS_PROJECT_ID_ENV = process.env.GCS_PROJECT_ID;
const GCS_CLIENT_EMAIL_ENV = process.env.GCS_CLIENT_EMAIL;
const GCS_PRIVATE_KEY_ENV = process.env.GCS_PRIVATE_KEY;

if (GCS_PROJECT_ID_ENV && GCS_CLIENT_EMAIL_ENV && GCS_PRIVATE_KEY_ENV) {
    try {
        const gcsCredentials = {
            project_id: GCS_PROJECT_ID_ENV,
            client_email: GCS_CLIENT_EMAIL_ENV,
            private_key: GCS_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        gcsStorage = new Storage({ credentials: gcsCredentials, projectId: GCS_PROJECT_ID_ENV });
    } catch (e) {
        console.error('GCS (삭제) 개별 환경 변수 에러:', e);
        // 초기화 실패 시 gcsStorage는 undefined 상태가 된다냥.
    }
} else {
    console.error('GCS (삭제) 개별 환경 변수 없음!');
}

// --- Firebase Admin SDK 초기화 (개별 환경 변수 사용) ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; // Firestore 인스턴스

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(firebaseServiceAccount) });
        }
        db = admin.firestore();
    } catch (e) {
        console.error('Firebase (삭제) 개별 환경 변수 에러 또는 초기화 실패:', e);
    }
} else {
    console.error('Firebase (삭제) 개별 환경 변수 없음!');
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') { // 삭제 요청도 중요한 변경이므로 POST로 받는다옹.
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다옹! (delete-photo)' }) };
    }

    if (!gcsStorage || !admin.apps.length || !db) {
        console.error('GCS 또는 Firebase 초기화 안됨 (삭제)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (GCS/Firebase 초기화 실패 - 삭제)' }) };
    }

    try {
        const { photoId, gcsFileName } = JSON.parse(event.body); // 클라이언트에서 photoId와 gcsFileName을 보내줘야 한다냥!

        if (!photoId) {
            return { statusCode: 400, body: JSON.stringify({ message: '삭제할 사진의 ID가 필요하다옹!' }) };
        }

        // 1. Firestore에서 문서 삭제
        await db.collection('photos').doc(photoId).delete();
        console.log(`야옹! Firestore에서 사진 문서 (ID: ${photoId}) 삭제 성공!`);

        // 2. Google Cloud Storage에서 파일 삭제 (gcsFileName이 있는 경우에만!)
        if (gcsFileName) {
            try {
                await gcsStorage.bucket(BUCKET_NAME).file(gcsFileName).delete();
                console.log(`야옹! GCS에서 이미지 파일 (${gcsFileName}) 삭제 성공!`);
            } catch (gcsError) {
                // GCS 파일 삭제 실패는 일단 로깅만 하고, Firestore 문서는 이미 삭제되었으니
                // 클라이언트에는 성공으로 응답할 수도 있고, 부분 실패로 응답할 수도 있다냥.
                // 여기서는 일단 로깅만 하고 넘어간다옹.
                console.error(`GCS 파일 (${gcsFileName}) 삭제 중 에러 발생! Firestore 문서는 삭제됨.`, gcsError);
            }
        } else {
            console.warn(`GCS 파일 이름이 없어서 GCS 파일 삭제는 건너뛴다옹 (Firestore 문서 ID: ${photoId})`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '사진 정보가 성공적으로 삭제되었다옹!' })
        };

    } catch (error) {
        console.error('Netlify Function (delete-photo) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (delete-photo): ${error.message || ''}` }) };
    }
};
// netlify/functions/get-photos.js
// Firestore에서 갤러리 사진 목록을 가져오는 함수다옹!

const admin = require('firebase-admin');

// --- Firebase Admin SDK 초기화 (개별 환경 변수 사용) ---
// 이 부분은 다른 Firebase 사용하는 함수들과 동일하게 설정해야 한다냥!
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; // Firestore 인스턴스를 담을 변수

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        // Firebase 앱이 이미 초기화되었는지 확인
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
            console.log('야옹! (get-photos) Firebase Admin SDK 초기화 성공!');
        }
        db = admin.firestore(); // Firestore 인스턴스 할당
    } catch (e) {
        console.error('Firebase (get-photos) 개별 환경 변수 에러 또는 초기화 실패:', e);
        // 함수 실행 초기에 초기화 실패 시, db 객체가 undefined일 수 있으므로 핸들러에서 체크 필요
    }
} else {
    console.error('Firebase (get-photos) 개별 환경 변수 (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) 중 일부 또는 전체가 없음!');
    // db 객체가 undefined일 것임
}


exports.handler = async (event, context) => {
    // HTTP 메소드가 GET이 아니면 에러 처리 (사진 목록 조회는 보통 GET 요청!)
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'GET 요청만 허용된다옹! (get-photos)' })
        };
    }

    // Firebase admin SDK가 성공적으로 초기화되었고 db 객체가 있는지 확인
    if (!admin.apps.length || !db) {
        console.error('Firebase 초기화 안됨 (get-photos)');
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - get-photos)' })
        };
    }

    try {
        // 'photos' 컬렉션의 모든 문서를 가져온다옹.
        // 필요하다면 .orderBy('createdAt', 'desc') 등으로 정렬할 수 있다냥 (최신순).
        const photosSnapshot = await db.collection('photos').orderBy('createdAt', 'desc').get();

        if (photosSnapshot.empty) {
            console.log('야옹... Firestore의 "photos" 컬렉션에 사진이 하나도 없다옹.');
            return {
                statusCode: 200, // 사진이 없는 것도 정상적인 상황일 수 있다냥.
                body: JSON.stringify([]) // 빈 배열 반환
            };
        }

        // 각 문서의 데이터를 추출하고, 문서 ID도 함께 포함시켜서 배열로 만든다옹.
        // 문서 ID는 나중에 특정 사진을 수정하거나 삭제할 때 필요하다냥!
        const photosList = photosSnapshot.docs.map(doc => ({
            id: doc.id, // Firestore 문서 ID를 id로 사용!
            ...doc.data() // 문서 안의 모든 필드 (imageUrl, title, category, createdAt 등)
        }));

        console.log(`야옹! Firestore에서 총 ${photosList.length}개의 사진 정보를 가져왔다옹!`);
        return {
            statusCode: 200,
            body: JSON.stringify(photosList)
        };

    } catch (error) {
        console.error('Netlify Function (get-photos) Firestore에서 사진 목록 읽기 에러:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `서버 에러 (get-photos): ${error.message || '알 수 없는 Firestore 오류'}` })
        };
    }
};
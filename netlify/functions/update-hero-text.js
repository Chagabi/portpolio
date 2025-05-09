// netlify/functions/update-hero-text.js (개별 환경 변수 사용 버전)

const admin = require('firebase-admin');

// Netlify 환경 변수에서 Firebase 접속 정보 (개별) 읽어오기
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            // Netlify 환경 변수에 넣을 때 \n이 \\n으로 바뀌는 경우가 많으므로, 다시 \n으로 바꿔준다옹!
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        // Firebase 앱이 이미 초기화되었는지 확인
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
        }
    } catch (e) {
        console.error('Firebase (update-hero-text) 개별 환경 변수 에러 또는 초기화 실패:', e);
        // 이 함수가 호출될 때 Firebase 초기화가 필수적이므로, 여기서 에러를 던지는 것이 좋다옹.
        throw new Error('Firebase (update-hero-text) 서비스 계정 키 설정 또는 파싱 실패!');
    }
} else {
    console.error('Firebase (update-hero-text) 개별 환경 변수 (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) 중 일부 또는 전체가 없음!');
    throw new Error('Firebase (update-hero-text) 서비스 계정 환경 변수가 설정되지 않았음!');
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받습니다 (update-hero-text)' }) };
    }

    // Firebase admin SDK가 성공적으로 초기화되었는지 확인
    if (!admin.apps.length || !db) {
        console.error('Firebase 초기화 안됨 (update-hero-text)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - update-hero-text)' }) };
    }

    try {
        const { title, subtitle } = JSON.parse(event.body);

        if (title === undefined || subtitle === undefined) {
            return { statusCode: 400, body: JSON.stringify({ message: '제목과 부제목이 필요합니다 (update-hero-text)' }) };
        }

        const heroDataToUpdate = {
            title: title,
            subtitle: subtitle,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('siteConfig').doc('hero').set(heroDataToUpdate, { merge: true });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 텍스트 업데이트 성공!', data: heroDataToUpdate }),
        };

    } catch (error) {
        console.error('Netlify Function (update-hero-text) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (update-hero-text): ${error.message || ''}` }) };
    }
};
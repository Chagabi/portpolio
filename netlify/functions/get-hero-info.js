// netlify/functions/get-hero-info.js (개별 환경 변수 사용 버전)

const admin = require('firebase-admin');

const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
        }
    } catch (e) {
        console.error('Firebase (get-hero-info) 개별 환경 변수 에러 또는 초기화 실패:', e);
        throw new Error('Firebase (get-hero-info) 서비스 계정 키 설정 또는 파싱 실패!');
    }
} else {
    console.error('Firebase (get-hero-info) 개별 환경 변수 (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) 중 일부 또는 전체가 없음!');
    throw new Error('Firebase (get-hero-info) 서비스 계정 환경 변수가 설정되지 않았음!');
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'GET 요청만 받습니다 (get-hero-info)' }) };
    }

    if (!admin.apps.length || !db) {
        console.error('Firebase 초기화 안됨 (get-hero-info)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - get-hero-info)' }) };
    }

    try {
        const heroDocRef = db.collection('siteConfig').doc('hero');
        const doc = await heroDocRef.get();

        if (!doc.exists) {
            return {
                statusCode: 200, 
                body: JSON.stringify({
                    title: '여기에 멋진 제목을!',
                    subtitle: '여기는 부제목을 쓰는 공간이다옹!',
                    imageUrl: '/api/placeholder/1200/500?text=Hero+Image'
                })
            };
        }

        const heroData = doc.data();
        return {
            statusCode: 200,
            body: JSON.stringify(heroData),
        };

    } catch (error) {
        console.error('Netlify Function (get-hero-info) Firestore 읽기 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (get-hero-info): ${error.message || ''}` }) };
    }
};
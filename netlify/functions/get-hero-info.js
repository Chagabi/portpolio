// netlify/functions/get-hero-info.js

const admin = require('firebase-admin');

// --- Firebase Admin SDK 초기화 (위의 함수와 동일하게!) ---
const FIREBASE_ADMIN_CONFIG = process.env.FIREBASE_ADMIN_SDK_CONFIG_JSON;
if (FIREBASE_ADMIN_CONFIG) {
    try {
        const serviceAccount = JSON.parse(FIREBASE_ADMIN_CONFIG);
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
            console.log('야옹! (get-hero) Firebase Admin SDK 초기화 성공!');
        }
    } catch (e) { console.error('냐옹... (get-hero) Firebase 초기화 실패!', e); }
} else { console.error('냐아아앙!!! (get-hero) FIREBASE_ADMIN_SDK_CONFIG_JSON 환경 변수 없음!'); }

const db = admin.firestore();

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ message: 'GET 요청만 받는다냥!' }) };
    }

    if (!admin.apps.length) { // Firebase 초기화 안됐으면 에러
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 안됨)' }) };
    }

    try {
        const heroDocRef = db.collection('siteConfig').doc('hero');
        const doc = await heroDocRef.get();

        if (!doc.exists) {
            console.log('야옹... Firestore에 히어로 정보가 아직 없다옹!');
            // 기본값을 반환하거나, 클라이언트에서 처리하도록 null 또는 빈 객체 반환
            return {
                statusCode: 200, // 또는 404 Not Found
                body: JSON.stringify({
                    title: '여기에 멋진 제목을!',
                    subtitle: '여기는 부제목을 쓰는 공간이다옹!',
                    imageUrl: '/api/placeholder/1200/500?text=Hero+Image' // 기본 플레이스홀더
                })
            };
        }

        const heroData = doc.data();
        console.log('야옹! Firestore에서 히어로 정보 가져오기 성공!');
        return {
            statusCode: 200,
            body: JSON.stringify(heroData),
        };

    } catch (error) {
        console.error('Netlify Function (get-hero) Firestore 읽기 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (get-hero): ${error.message || ''}` }) };
    }
};
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

// netlify/functions/get-hero-info.js (수정 제안)

// ... (Firebase 초기화 코드는 동일) ...

exports.handler = async (event, context) => {
    // ... (요청 검증 및 초기화 확인은 동일) ...

    try {
        const heroDocRef = db.collection('siteConfig').doc('hero');
        const doc = await heroDocRef.get();

        let responseData;
        if (!doc.exists) {
            console.log('get-hero-info: Firestore에 hero 문서 없음, 기본값 반환');
            responseData = {
                title: '여기에 멋진 제목을!',
                subtitle: '여기는 부제목을 쓰는 공간이다옹!',
                imageUrl: '/api/placeholder/1200/500?text=Hero+Image' // 클라이언트 기본값과 일치시키기
            };
        } else {
            responseData = doc.data();
            console.log('get-hero-info: Firestore에서 가져온 데이터:', responseData);
        }

        return {
            statusCode: 200,
            headers: { // 냐옹! 캐시 방지 헤더 추가!
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify(responseData),
        };

    } catch (error) {
        console.error('Netlify Function (get-hero-info) Firestore 읽기 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (get-hero-info): ${error.message || '알 수 없는 오류'}` }) };
    }
};
// netlify/functions/update-hero-text.js (수정된 버전이다옹!)

const admin = require('firebase-admin');

// ... (Firebase 초기화 코드는 동일하게 유지) ...
// Netlify 환경 변수에서 Firebase 접속 정보 (개별) 읽어오기
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; // db를 밖에서 선언해야 핸들러에서도 쓸 수 있다냥
let firebaseInitializationError = null;

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
        db = admin.firestore(); // 초기화 성공 시 db 할당
    } catch (e) {
        firebaseInitializationError = `Firebase (update-hero-text) 초기화 실패: ${e.message}`;
        console.error(firebaseInitializationError);
    }
} else {
    firebaseInitializationError = 'Firebase (update-hero-text) 서비스 계정 환경 변수 미설정!';
    console.error(firebaseInitializationError);
}


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받습니다 (update-hero-text)' }) };
    }

    if (firebaseInitializationError) { // 초기화 에러 먼저 확인
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${firebaseInitializationError}` }) };
    }
    if (!admin.apps.length || !db) { // db 인스턴스 확인
        console.error('Firebase 초기화 안됨 (update-hero-text)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - update-hero-text)' }) };
    }

    try {
        // 냐옹! 클라이언트에서 imageUrl도 같이 보내주니까 여기서도 받아야 한다옹!
        const { title, subtitle, imageUrl } = JSON.parse(event.body);

        console.log('update-hero-text 함수 실행! 받은 데이터:', { title, subtitle, imageUrl }); // 로그 추가!

        // imageUrl도 필수값으로 체크하거나, 아니면 기본값을 설정할 수 있다옹.
        // deleteHeroImage에서는 DEFAULT_HERO_IMAGE_URL을 보내주므로 여기서는 값이 있을 거다냥.
        if (title === undefined || subtitle === undefined || imageUrl === undefined) {
            return { statusCode: 400, body: JSON.stringify({ message: '제목, 부제목, 이미지 URL이 모두 필요합니다 (update-hero-text)' }) };
        }

        const heroDataToUpdate = {
            title: title,
            subtitle: subtitle,
            imageUrl: imageUrl, // 냐옹! imageUrl도 업데이트 대상에 포함!
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // 'siteConfig' 컬렉션의 'hero' 문서에 데이터를 덮어쓴다옹.
        // .set()을 사용하고 merge:false (기본값) 또는 아예 merge 옵션을 빼면 전체 덮어쓰기가 된다냥.
        // 만약 다른 필드(예: 예전에 추가한 gcsFileName)를 유지하고 싶다면 merge:true를 써야 하지만,
        // 지금은 title, subtitle, imageUrl만 관리하므로 set으로 전체를 지정하는 게 깔끔할 수 있다옹.
        await db.collection('siteConfig').doc('hero').set(heroDataToUpdate); 
        // 또는, 특정 필드만 확실히 업데이트하고 싶다면 .update()를 쓸 수도 있다냥.
        // await db.collection('siteConfig').doc('hero').update(heroDataToUpdate); 
        // 하지만 update는 문서가 존재하지 않으면 에러를 내므로, set이 더 안전할 수 있다옹.

        console.log('Firestore에 히어로 정보 업데이트 성공!', heroDataToUpdate);

        return {
            statusCode: 200,
            // 클라이언트에서 이 데이터를 사용해서 heroInfo를 업데이트하므로, 저장된 데이터를 그대로 반환하는 게 좋다옹.
            body: JSON.stringify({ message: '히어로 정보 업데이트 성공!', data: heroDataToUpdate }),
        };

    } catch (error) {
        console.error('Netlify Function (update-hero-text) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (update-hero-text): ${error.message || '알 수 없는 오류'}` }) };
    }
};
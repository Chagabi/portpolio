// netlify/functions/update-hero-text.js (냐옹이가 수정한 버전이다옹!)

const admin = require('firebase-admin');

// Netlify 환경 변수에서 Firebase 접속 정보 (개별) 읽어오기
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; 
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
        db = admin.firestore(); 
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

    if (firebaseInitializationError) { 
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${firebaseInitializationError}` }) };
    }
    if (!admin.apps.length || !db) { 
        console.error('Firebase 초기화 안됨 (update-hero-text)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - update-hero-text)' }) };
    }

    try {
        // 냐옹! 클라이언트에서 imageUrl을 보내지 않을 수도 있으니, 구조 분해 할당 시 주의한다옹!
        const requestBody = JSON.parse(event.body);
        const { title, subtitle } = requestBody; // imageUrl은 여기서 바로 받지 않는다옹.
        const imageUrl = requestBody.imageUrl; // imageUrl이 있을 수도, 없을 수도 있다냥.

        console.log('update-hero-text 함수 실행! 받은 데이터:', { title, subtitle, imageUrl }); 

        // 이제 제목과 부제목만 필수값으로 체크한다옹!
        if (title === undefined || subtitle === undefined) {
            // 메시지도 조금 더 친절하게 바꿔주자옹!
            return { statusCode: 400, body: JSON.stringify({ message: '제목과 부제목은 꼭 필요하다옹! (update-hero-text)' }) };
        }

        const heroDataToUpdate = {
            title: title,
            subtitle: subtitle,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // imageUrl이 실제로 전달되었을 경우에만 heroDataToUpdate 객체에 추가한다옹.
        // 이렇게 하면 imageUrl이 없으면 Firestore에 해당 필드가 아예 저장되지 않거나,
        // 기존 값을 유지하고 싶다면 .update()를 사용해야 하지만, 여기서는 .set()을 쓰니까 없는 필드는 없는 대로 저장된다옹.
        // 만약 imageUrl을 명시적으로 삭제하거나 빈 값으로 만들고 싶다면 다른 처리가 필요하다옹.
        // 지금은 imageUrl을 사용하지 않으므로, 전달되면 저장하고, 전달되지 않으면 저장하지 않는 방향으로 간다옹.
        if (imageUrl !== undefined) {
            heroDataToUpdate.imageUrl = imageUrl;
        } else {
            // imageUrl이 제공되지 않았을 때, Firestore에서 이 필드를 어떻게 처리할지 결정해야 한다옹.
            // 1. 필드 자체를 저장하지 않음 (위의 if (imageUrl !== undefined) 조건으로 이미 이렇게 동작한다옹)
            // 2. null이나 빈 문자열로 명시적으로 저장:
            //    heroDataToUpdate.imageUrl = null; // 또는 ""
            // 여기서는 이미지 자체를 안 쓰기로 했으니, 굳이 null이나 빈 값으로 저장할 필요는 없어보인다냥.
            // 만약 Firestore에서 imageUrl 필드를 완전히 제거하고 싶다면,
            // heroDataToUpdate.imageUrl = admin.firestore.FieldValue.delete();
            // 하지만 이 코드는 update 메서드에서만 쓸 수 있다옹.
            // .set()을 사용할 때는, 그냥 imageUrl을 객체에 포함시키지 않으면 된다냥.
        }
        
        // 'siteConfig' 컬렉션의 'hero' 문서에 데이터를 덮어쓴다옹.
        // merge: true 옵션을 사용하면 기존 필드를 유지하면서 새로운 내용만 업데이트/추가할 수 있다옹!
        // title, subtitle은 덮어쓰고, imageUrl은 있으면 덮어쓰고 없으면 없는대로, 다른 기존 필드는 유지!
        await db.collection('siteConfig').doc('hero').set(heroDataToUpdate, { merge: true }); 

        console.log('Firestore에 히어로 정보 업데이트 성공!', heroDataToUpdate);

        // 클라이언트에게 반환하는 데이터에서도 imageUrl이 없을 수 있음을 명시하거나,
        // 업데이트된 heroDataToUpdate (imageUrl이 있을수도 없을수도 있음)를 그대로 반환한다옹.
        const responseData = { ...heroDataToUpdate };
        // Firestore 타임스탬프는 클라이언트에서 바로 쓰기 어려우니, 필요하다면 변환하거나 제외할 수 있다옹.
        // 여기서는 일단 그대로 반환!
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 정보 업데이트 성공!', data: responseData }),
        };

    } catch (error) {
        console.error('Netlify Function (update-hero-text) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (update-hero-text): ${error.message || '알 수 없는 오류'}` }) };
    }
};
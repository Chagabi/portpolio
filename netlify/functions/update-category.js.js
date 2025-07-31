// netlify/functions/update-category.js
const admin = require('firebase-admin');

// Netlify 환경 변수에서 Firebase 접속 정보 (개별) 읽어오기
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db;
let firebaseInitializationError = null;

// Firebase Admin SDK 초기화
// 이미 다른 Netlify Function에서 초기화했다면 이 부분은 필요 없다옹!
if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            // 개인 키는 환경 변수에 저장될 때 줄바꿈이 \\n으로 인코딩될 수 있어서 \n으로 바꿔줘야 한다옹!
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n') 
        };
        if (admin.apps.length === 0) { // Firebase 앱이 아직 초기화되지 않았다면 초기화한다옹!
            admin.initializeApp({ credential: admin.credential.cert(firebaseServiceAccount) });
        }
        db = admin.firestore(); // Firestore 인스턴스 가져오기
    } catch (e) {
        firebaseInitializationError = `냐옹! Firebase (카테고리 업데이트) 초기화 실패다옹: ${e.message}`;
        console.error(firebaseInitializationError);
    }
} else {
    firebaseInitializationError = '냐옹! Firebase (카테고리 업데이트) 서비스 계정 환경 변수가 설정되지 않았다옹!';
    console.error(firebaseInitializationError);
}


exports.handler = async (event, context) => {
    // POST 요청만 처리한다옹!
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: '냐옹! POST 요청만 받는다옹!' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    // Firebase 초기화에 문제가 있었다면 에러를 반환한다옹!
    if (firebaseInitializationError) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: `서버 설정 오류: ${firebaseInitializationError}` }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
    // db 인스턴스가 제대로 초기화되었는지 다시 확인한다옹!
    if (!db) {
        console.error('냐옹! Firestore DB 인스턴스가 초기화되지 않았다옹!');
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: '서버 내부 설정 오류 (DB 인스턴스 누락)' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    try {
        // 요청 본문에서 카테고리 ID와 새 이름을 가져온다옹.
        const { id, newName } = JSON.parse(event.body);

        // 필수 값들이 있는지 확인한다옹.
        if (!id || !newName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: '냐옹! 카테고리 ID와 새 이름이 모두 필요하다옹!' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        // '전체'는 예약어니까 사용하지 못하게 막는다옹.
        if (newName.toLowerCase() === '전체') {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "'전체'는 카테고리 이름으로 사용할 수 없다옹!" }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        // Firestore에서 해당 카테고리 문서를 참조한다옹.
        const categoryRef = db.collection('categories').doc(id);
        const categoryDoc = await categoryRef.get();

        // 문서가 존재하는지 확인한다옹.
        if (!categoryDoc.exists) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: '냐옹! 해당 카테고리를 찾을 수 없다옹!' }),
                headers: { 'Content-Type': 'application/json' }
            };
        }

        // 카테고리 이름을 업데이트한다옹!
        await categoryRef.update({ name: newName });

        // 카테고리 이름이 변경되었으니, 이 카테고리를 사용하는 모든 사진의 카테고리 필드도 업데이트해야 한다옹.
        // Firestore 쿼리 제한 때문에 직접 모든 사진을 한 번에 업데이트하기는 어렵다옹.
        // 여기서는 간단하게 처리하지만, 실제 프로덕션에서는 배치 쓰기(Batch Write)나
        // 더 정교한 방법(예: Firestore Trigger Function)을 고려해야 한다옹!
        const photosQuery = db.collection('photos').where('category', '==', categoryDoc.data().name);
        const photosSnapshot = await photosQuery.get();

        const batch = db.batch();
        photosSnapshot.forEach(doc => {
            const photoRef = db.collection('photos').doc(doc.id);
            batch.update(photoRef, { category: newName });
        });
        await batch.commit(); // 배치 업데이트 실행!

        // 성공 응답을 보낸다옹.
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '카테고리 이름과 관련 사진들이 성공적으로 업데이트되었다옹!', name: newName })
        };
    } catch (error) {
        console.error('냐옹! 서버에서 카테고리 이름 수정 중 에러 발생이다옹:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '냐옹! 서버 에러로 카테고리 이름 수정에 실패했다옹!', error: error.message }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
};

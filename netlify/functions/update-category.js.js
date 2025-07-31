// netlify/functions/update-category.js
const admin = require('firebase-admin');

// Firebase Admin SDK 초기화
// 이미 다른 Netlify Function에서 초기화했다면 이 부분은 필요 없다옹!
// 너의 Firebase 프로젝트에 맞게 서비스 계정 키를 설정해야 한다옹.
// 환경 변수 (예: FIREBASE_SERVICE_ACCOUNT_KEY)를 사용하는 것이 안전하다냥!
if (!admin.apps.length) {
    // 환경 변수에서 서비스 계정 키를 불러와서 사용한다옹.
    // Netlify 대시보드에서 FIREBASE_SERVICE_ACCOUNT_KEY 환경 변수에
    // Firebase 서비스 계정 JSON 키의 내용을 직접 붙여넣어달라옹!
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("냐옹! Firebase 서비스 계정 키를 파싱하는 데 실패했다옹:", e);
        // 개발 환경에서 로컬 테스트를 위해 임시로 기본 앱을 초기화할 수도 있다옹.
        // 하지만 실제 배포 환경에서는 환경 변수를 꼭 사용해야 한다냥!
        admin.initializeApp(); 
    }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    // POST 요청만 처리한다옹!
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: '냐옹! POST 요청만 받는다옹!' }),
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

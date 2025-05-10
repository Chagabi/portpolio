// functions/delete-category.js
// 카테고리를 Firestore에서 삭제하는 함수다옹!

const admin = require('firebase-admin');

// --- Firebase Admin SDK 초기화 (get-photos.js, get-categories.js 와 똑같이!) ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db;

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        if (admin.apps.length === 0) { // 앱이 이미 초기화 안 됐을 때만 초기화!
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
            console.log('야옹! (add-category) Firebase Admin SDK 초기화 성공!');
        }
        db = admin.firestore(); // Firestore 인스턴스 할당!
    } catch (e) {
        console.error('Firebase (add-category) 초기화 실패:', e);
    }
} else {
    console.error('Firebase (add-category) 환경 변수 (FIREBASE_PROJECT_ID 등) 중 일부 또는 전체가 없다옹!');
}

exports.handler = async (event, context) => {
    // 이 함수는 POST 요청으로만 카테고리를 삭제할 수 있게 하자옹.
    // (나중에 DELETE 메소드를 쓰고 싶으면 그렇게 바꿔도 된다냥!)
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: 'POST 요청만 허용된다옹! (delete-category)' })
        };
    }

    // Firebase DB가 준비 안 됐으면 에러! (db 변수가 초기화되었는지 확인!)
    if (typeof db === 'undefined' || !db) { 
        console.error('Firebase DB 초기화 안됨 (delete-category)');
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '서버 내부 설정 오류 (DB 초기화 실패 - delete-category)' })
        };
    }

    try {
        // 클라이언트에서 보낸 요청 본문(body)에서 삭제할 카테고리의 ID를 꺼낸다옹.
        let data;
        try {
            data = JSON.parse(event.body);
        } catch(e) {
            console.error("요청 본문(body) 파싱 에러 (delete-category):", e);
            return { 
                statusCode: 400, // Bad Request
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: '요청 내용(JSON)이 이상하다옹! 다시 확인해달라냥!' }) 
            };
        }
        
        const categoryIdToDelete = data.id; // 삭제할 카테고리의 Firestore 문서 ID!

        // 카테고리 ID가 비어있으면 안 된다옹!
        if (!categoryIdToDelete) {
            return {
                statusCode: 400, // Bad Request
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: '삭제할 카테고리 ID(id)가 꼭 필요하다옹!' })
            };
        }

        // Firestore의 'categories' 컬렉션에서 해당 ID를 가진 문서를 삭제!
        await db.collection('categories').doc(categoryIdToDelete).delete();

        console.log(`카테고리 삭제 성공! ID: ${categoryIdToDelete} (delete-category)`);
        return {
            statusCode: 200, // OK (성공!) 또는 204 (No Content)도 많이 쓴다냥.
            headers: {
                "Access-Control-Allow-Origin": "*", 
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: `카테고리(ID: ${categoryIdToDelete})가 성공적으로 삭제되었다옹!` })
        };

    } catch (error) {
        console.error('카테고리 삭제 중 에러 ㅠㅠ (delete-category):', error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: `서버 에러 (delete-category): ${error.message || '카테고리 삭제에 실패했다옹.'}` })
        };
    }
};
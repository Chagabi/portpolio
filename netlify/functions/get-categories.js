// functions/get-categories.js
// Firestore에서 카테고리 목록을 가져오는 함수다옹! (get-photos.js 스타일로!)

const admin = require('firebase-admin');

// --- Firebase Admin SDK 초기화 (집사님의 get-photos.js와 동일한 방식이다옹!) ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; // Firestore 인스턴스를 담을 변수다냥

// 환경 변수들이 모두 있는지 먼저 확인한다옹!
if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            // FIREBASE_PRIVATE_KEY_ENV에서 '\n' 문자열을 실제 줄바꿈으로 변경! 아주 중요하다옹!
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };

        // Firebase 앱이 이미 초기화되었는지 확인 (중복 초기화 방지!)
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
            console.log('야옹! (get-categories) Firebase Admin SDK 초기화 성공!');
        }
        db = admin.firestore(); // Firestore 인스턴스 할당! 이제 db 객체로 작업할 수 있다옹!
    } catch (e) {
        console.error('Firebase (get-categories) 초기화 실패:', e);
        // 초기화 실패 시 db는 undefined 상태일 거다냥. 핸들러에서 체크!
    }
} else {
    console.error('Firebase (get-categories) 환경 변수 (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) 중 일부 또는 전체가 없다옹!');
    // 이 경우에도 db는 undefined 상태일 거다냥.
}

exports.handler = async (event, context) => {
    // HTTP 메소드가 GET이 아니면 에러 처리 (카테고리 목록 조회는 GET 요청!)
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405, // Method Not Allowed
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: 'GET 요청만 허용된다옹! (get-categories)' })
        };
    }

    // Firebase admin SDK가 성공적으로 초기화되었고 db 객체가 있는지 꼼꼼하게 확인!
    if (!admin.apps.length || !db) {
        console.error('Firebase 초기화 안됨 (get-categories)');
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '서버 내부 설정 오류 (Firebase 초기화 실패 - get-categories)' })
        };
    }

    try {
        // 'categories' 컬렉션에서 모든 문서를 가져온다옹.
        // 'name' 필드를 기준으로 가나다 순으로 정렬하면 사용자가 보기 편할 거다냥!
        const categoriesSnapshot = await db.collection('categories').orderBy('name').get();

        const categories = [];
        categoriesSnapshot.forEach(doc => {
            categories.push({
                id: doc.id,      // 문서 ID도 같이 보내주면 나중에 수정/삭제할 때 유용하다옹!
                ...doc.data()    // 카테고리 이름('name') 등이 담긴 데이터
            });
        });

        console.log(`야옹! Firestore에서 총 ${categories.length}개의 카테고리 정보를 가져왔다옹! (get-categories)`);
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*", // 실제 운영 시에는 집사님 웹사이트 도메인으로 바꿔주자옹!
                "Content-Type": "application/json"
            },
            body: JSON.stringify(categories)
        };

    } catch (error) {
        console.error('Netlify Function (get-categories) Firestore에서 카테고리 목록 읽기 에러:', error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: `서버 에러 (get-categories): ${error.message || '알 수 없는 Firestore 오류'}` })
        };
    }
};
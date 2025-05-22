// functions/add-category.js
// 새 카테고리를 Firestore에 추가하는 함수다옹!

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
    // 이 함수는 POST 요청으로만 카테고리를 추가할 수 있게 할 거다옹!
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: 'POST 요청만 허용된다옹! (add-category)' })
        };
    }

    // Firebase DB가 준비 안 됐으면 에러!
    if (!db) {
        console.error('Firebase DB 초기화 안됨 (add-category)');
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '서버 내부 설정 오류 (DB 초기화 실패 - add-category)' })
        };
    }

    try {
        // 클라이언트(웹페이지)에서 보낸 요청 본문(body)에서 카테고리 이름을 꺼낸다옹.
        // 요청 본문은 JSON 형태일 거라서 JSON.parse()로 변환!
        let data;
        try {
            data = JSON.parse(event.body);
        } catch(e) {
            console.error("요청 본문(body) 파싱 에러 (add-category):", e);
            return { 
                statusCode: 400, // Bad Request
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: '요청 내용(JSON)이 이상하다옹! 다시 확인해달라냥!' }) 
            };
        }
        
        const categoryName = data.name ? data.name.trim() : null;

        // 카테고리 이름이 비어있으면 안 된다옹!
        if (!categoryName) {
            return {
                statusCode: 400, // Bad Request
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: '카테고리 이름(name)이 꼭 필요하다옹!' })
            };
        }

        // 냐옹! 이미 있는 카테고리 이름인지 확인해보자옹! (중복 방지!)
        const existingCategoryQuery = await db.collection('categories').where('name', '==', categoryName).limit(1).get();
        if (!existingCategoryQuery.empty) {
            console.log(`'${categoryName}' 카테고리는 이미 있다옹! (add-category)`);
            return {
                statusCode: 409, // Conflict (이미 리소스가 존재함)
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: `'${categoryName}' 카테고리는 이미 있다옹! 다른 이름을 써달라냥!` })
            };
        }

        // 새 카테고리 문서에 저장할 내용! 이름이랑 만든 시간(서버 시간 기준)을 넣어주자옹.
        const newCategoryData = {
            name: categoryName,
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        };

        // 'categories' 컬렉션에 새 문서를 추가한다옹!
        const docRef = await db.collection('categories').add(newCategoryData);
        
        // 클라이언트에게 돌려줄 데이터 (방금 만든 카테고리 정보!)
        // createdAt은 서버에서 실제 저장될 때 값이 정해지므로, 여기서는 응답용으로 현재 시간을 넣어준다옹.
        // 정확한 값은 Firestore에서 직접 확인하거나, 문서를 다시 읽어와야 한다냥.
        const addedCategoryForResponse = { 
            id: docRef.id, 
            name: newCategoryData.name,
            createdAt: new Date().toISOString() // 응답 시점의 시간 (근사치)
        };

        console.log(`카테고리 추가 성공! ID: ${docRef.id}, 이름: ${categoryName} (add-category)`);
        return {
            statusCode: 201, // Created (성공적으로 만들어졌다는 뜻!)
            headers: {
                "Access-Control-Allow-Origin": "*", // 역시 실제 서비스에선 특정 도메인으로!
                "Content-Type": "application/json"
            },
            body: JSON.stringify(addedCategoryForResponse) // 새로 만들어진 카테고리 정보를 돌려준다옹!
        };

    } catch (error) {
        console.error('카테고리 추가 중 에러 ㅠㅠ (add-category):', error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: `서버 에러 (add-category): ${error.message || '카테고리 추가에 실패했다옹.'}` })
        };
    }
};
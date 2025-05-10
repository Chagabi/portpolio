// functions/delete-category.js
const admin = require('firebase-admin');

// --- Firebase Admin SDK 초기화 (get-photos.js, get-categories.js 와 똑같이!) ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db;
let storage; // 냐옹! 스토리지 객체를 위한 변수 추가!
const GCS_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET_ENV; // GCS 버킷 이름 환경 변수! (이건 새로 추가해야 할 수도 있다옹!)

if (
    process.env.FIREBASE_PROJECT_ID_ENV &&
    process.env.FIREBASE_CLIENT_EMAIL_ENV &&
    process.env.FIREBASE_PRIVATE_KEY_ENV &&
    GCS_BUCKET_NAME // 버킷 이름도 확인!
) {
    try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n');
        if (admin.apps.length === 0) { // 앱이 아직 초기화되지 않았을 때만 초기화
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID_ENV,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL_ENV,
                    privateKey: privateKey,
                }),
                storageBucket: GCS_BUCKET_NAME // 스토리지 버킷 지정!
            });
        }
        db = admin.firestore();
        storage = admin.storage(); // 냐옹! 스토리지 객체 할당!
        console.log('Firebase Admin SDK 초기화 성공! (delete-category)');
    } catch (e) {
        console.error('Firebase Admin SDK 초기화 에러 ㅠㅠ (delete-category):', e);
        // db 또는 storage가 초기화 안 된 상태로 남게 된다옹.
    }
} else {
    console.warn('Firebase Admin SDK 초기화를 위한 환경 변수가 부족하다옹! (delete-category)');
    // 로컬 테스트 등을 위해 기본 초기화를 시도할 수도 있지만, 배포 환경에서는 위 변수들이 필수다옹.
    // if (!admin.apps.length) { admin.initializeApp(); } // 기본 초기화 (권한 문제가 생길 수 있음)
    // db = admin.firestore();
    // storage = admin.storage();
}
// --- 여기까지 Firebase Admin SDK 초기화 복사 ---

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: 'POST 요청만 허용된다옹! (delete-category)' })
        };
    }

    if (!db || !storage || !GCS_BUCKET_NAME) { // storage와 버킷 이름도 확인!
        console.error('Firebase DB 또는 Storage 또는 버킷 이름이 준비 안됨 (delete-category)');
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '서버 내부 설정 오류 (DB/Storage 초기화 실패 - delete-category)' })
        };
    }

    let data;
    try {
        data = JSON.parse(event.body);
    } catch (e) {
        console.error("요청 본문(body) 파싱 에러 (delete-category):", e);
        return { 
            statusCode: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '요청 내용(JSON)이 이상하다옹!' }) 
        };
    }
    
    const categoryIdToDelete = data.id;

    if (!categoryIdToDelete) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '삭제할 카테고리 ID(id)가 꼭 필요하다옹!' })
        };
    }

    try {
        console.log(`카테고리 삭제 절차 시작: ID ${categoryIdToDelete} (delete-category)`);

        // 1. 삭제할 카테고리 정보 (특히 이름) 가져오기
        const categoryRef = db.collection('categories').doc(categoryIdToDelete);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            console.log(`삭제할 카테고리를 찾을 수 없다옹: ID ${categoryIdToDelete} (delete-category)`);
            return {
                statusCode: 404, // Not Found
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: `삭제할 카테고리(ID: ${categoryIdToDelete})를 찾을 수 없다옹.` })
            };
        }
        const categoryNameToDelete = categoryDoc.data().name;
        console.log(`삭제할 카테고리 이름: "${categoryNameToDelete}" (ID: ${categoryIdToDelete}) (delete-category)`);

        // 2. 이 카테고리 이름을 사용하는 모든 사진 문서 찾기
        const photosQuerySnapshot = await db.collection('photos')
                                          .where('category', '==', categoryNameToDelete)
                                          .get();
        
        const photoDeletionPromises = []; // 사진 삭제 작업들을 담을 배열

        if (photosQuerySnapshot.empty) {
            console.log(`"${categoryNameToDelete}" 카테고리에 속한 사진이 없다옹. (delete-category)`);
        } else {
            console.log(`"${categoryNameToDelete}" 카테고리에서 ${photosQuerySnapshot.size}개의 사진을 발견했다옹. 삭제를 시작한다냥... (delete-category)`);
            
            photosQuerySnapshot.forEach(photoDoc => {
                const photoData = photoDoc.data();
                const photoId = photoDoc.id;
                const gcsFileName = photoData.gcsFileName; // 사진 문서에 이 필드가 있어야 한다옹!

                // 2-A. GCS에서 실제 이미지 파일 삭제
                if (gcsFileName) {
                    const file = storage.bucket(GCS_BUCKET_NAME).file(gcsFileName);
                    photoDeletionPromises.push(
                        file.delete().then(() => {
                            console.log(`GCS 파일 삭제 성공: ${gcsFileName} (사진 ID: ${photoId}) (delete-category)`);
                        }).catch(err => {
                            // 파일이 이미 없거나 권한 문제 등일 수 있다옹. 일단 로그만 남기고 계속 진행할 수 있게 처리.
                            console.error(`GCS 파일 삭제 실패: ${gcsFileName} (사진 ID: ${photoId}). 오류:`, err.message, '(delete-category)');
                            // 여기서 에러를 throw하면 전체 작업이 중단될 수 있으니, 일단은 개별 파일 삭제 실패는 로그로만 남기자옹.
                            // 중요한 건 Firestore 문서 삭제는 계속 시도하는 것이다냥. (상황에 따라 정책 결정)
                        })
                    );
                } else {
                    console.warn(`사진 문서(ID: ${photoId})에 gcsFileName이 없다옹. GCS 파일 삭제를 건너뛴다냥. (delete-category)`);
                }

                // 2-B. Firestore에서 사진 문서 삭제
                photoDeletionPromises.push(
                    db.collection('photos').doc(photoId).delete().then(() => {
                        console.log(`Firestore 사진 문서 삭제 성공: ID ${photoId} (delete-category)`);
                    }).catch(err => {
                        console.error(`Firestore 사진 문서(ID: ${photoId}) 삭제 실패. 오류:`, err.message, '(delete-category)');
                        // 이것도 개별 문서 삭제 실패는 로그로만 남겨보자옹.
                    })
                );
            });
        }

        // 모든 사진 파일 및 문서 삭제 작업이 (성공하든 일부 실패하든) 완료될 때까지 기다린다옹.
        // Promise.allSettled를 사용하면 일부가 실패해도 나머지는 계속 진행하고 결과를 모두 받을 수 있다옹.
        const deletionResults = await Promise.allSettled(photoDeletionPromises);
        console.log("모든 사진 관련 삭제 시도 완료. 결과:", deletionResults, '(delete-category)');
        
        // 실패한 작업이 있는지 확인하고 싶다면 deletionResults를 순회하며 status가 'rejected'인 것을 찾으면 된다옹.
        const failedDeletions = deletionResults.filter(result => result.status === 'rejected');
        if (failedDeletions.length > 0) {
            console.warn(`사진 삭제 작업 중 ${failedDeletions.length}개가 실패했다옹. 로그를 확인해달라냥. (delete-category)`);
            // 여기서 사용자에게 부분 실패를 알릴지, 아니면 그냥 카테고리 삭제는 계속 진행할지 결정할 수 있다옹.
            // 일단은 계속 진행한다냥.
        }

        // 3. 원래 카테고리 문서 삭제
        await categoryRef.delete();
        console.log(`카테고리 문서 삭제 성공! 이름: "${categoryNameToDelete}", ID: ${categoryIdToDelete} (delete-category)`);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                message: `카테고리 '${categoryNameToDelete}'(와)과 관련된 사진들이 모두 삭제 처리되었다옹! (총 ${photosQuerySnapshot.size}개 사진 시도)` 
            })
        };

    } catch (error) {
        console.error(`카테고리 및 관련 사진 삭제 중 전체 에러 ㅠㅠ (ID: ${categoryIdToDelete}) (delete-category):`, error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                message: `서버 에러 (delete-category): ${error.message || '카테고리 및 관련 데이터 삭제에 실패했다옹.'}` 
            })
        };
    }
};
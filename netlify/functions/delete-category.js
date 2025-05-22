// functions/delete-category.js
const admin = require('firebase-admin');

let db;
let storage;
// Netlify에 설정된 환경 변수 이름을 직접 사용한다옹!
const GCS_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET_ENV; 

// Firebase Admin SDK 초기화
// Netlify에 설정된 환경 변수 이름들을 정확히 사용해야 한다옹!
if (
    process.env.FIREBASE_PROJECT_ID &&     // Netlify에 'FIREBASE_PROJECT_ID' 라는 이름으로 설정되어 있다고 가정!
    process.env.FIREBASE_CLIENT_EMAIL &&   // Netlify에 'FIREBASE_CLIENT_EMAIL' 이라는 이름으로 설정되어 있다고 가정!
    process.env.FIREBASE_PRIVATE_KEY &&    // Netlify에 'FIREBASE_PRIVATE_KEY' 라는 이름으로 설정되어 있다고 가정!
    GCS_BUCKET_NAME                        // 이건 위에서 process.env.FIREBASE_STORAGE_BUCKET_ENV 로 할당!
) {
    try {
        // Netlify 환경 변수에서 private key의 \n 줄바꿈 문자를 실제 줄바꿈으로 변경
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        
        // Firebase 앱이 아직 초기화되지 않았을 때만 초기화 수행
        if (admin.apps.length === 0) { 
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey,
                }),
                storageBucket: GCS_BUCKET_NAME // 스토리지 버킷 지정
            });
        }
        db = admin.firestore();
        storage = admin.storage(); 
        console.log('Firebase Admin SDK 초기화 성공! DB 및 Storage 준비 완료! (delete-category)');
    } catch (e) {
        console.error('Firebase Admin SDK 초기화 중 심각한 에러 발생 ㅠㅠ (delete-category):', e);
        // db 또는 storage가 초기화 안 된 상태로 남을 수 있다옹.
        // 이 경우 아래 핸들러 초반의 null 체크에서 걸리게 된다냥.
    }
} else {
    // 필수 환경 변수 중 하나라도 누락된 경우
    console.warn('Firebase Admin SDK 초기화를 위한 필수 환경 변수가 부족하다옹! (delete-category)');
    if (!process.env.FIREBASE_PROJECT_ID) console.warn('- 환경변수 FIREBASE_PROJECT_ID 가 없다옹!');
    if (!process.env.FIREBASE_CLIENT_EMAIL) console.warn('- 환경변수 FIREBASE_CLIENT_EMAIL 이 없다옹!');
    if (!process.env.FIREBASE_PRIVATE_KEY) console.warn('- 환경변수 FIREBASE_PRIVATE_KEY 가 없다옹!');
    if (!GCS_BUCKET_NAME) console.warn('- 환경변수 FIREBASE_STORAGE_BUCKET_ENV (GCS_BUCKET_NAME 용) 이 없다옹!');
    // db와 storage는 undefined 상태로 남게 된다옹.
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: 'POST 요청만 허용된다옹! (delete-category)' })
        };
    }

    // db, storage, GCS_BUCKET_NAME이 성공적으로 초기화되었는지 다시 한번 확인!
    if (!db || !storage || !GCS_BUCKET_NAME) { 
        console.error('Firebase DB 또는 Storage 또는 버킷 이름이 준비 안됨. 핸들러 실행 불가! (delete-category)');
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
            statusCode: 400, // Bad Request
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '요청 내용(JSON)이 이상하다옹! 다시 확인해달라냥!' }) 
        };
    }
    
    const categoryIdToDelete = data.id; // 삭제할 카테고리의 Firestore 문서 ID!

    if (!categoryIdToDelete) {
        return {
            statusCode: 400, // Bad Request
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: '삭제할 카테고리 ID(id)가 꼭 필요하다옹!' })
        };
    }

    try {
        console.log(`카테고리 및 관련 사진 삭제 절차 시작: 카테고리 ID ${categoryIdToDelete} (delete-category)`);

        // 1. 삭제할 카테고리 정보 (특히 '이름') 가져오기
        const categoryRef = db.collection('categories').doc(categoryIdToDelete);
        const categoryDoc = await categoryRef.get();

        if (!categoryDoc.exists) {
            console.log(`삭제할 카테고리(ID: ${categoryIdToDelete})를 찾을 수 없다옹. (delete-category)`);
            return {
                statusCode: 404, // Not Found
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ message: `삭제할 카테고리(ID: ${categoryIdToDelete})를 찾을 수 없다옹.` })
            };
        }
        const categoryNameToDelete = categoryDoc.data().name;
        console.log(`삭제 대상 카테고리 이름: "${categoryNameToDelete}" (ID: ${categoryIdToDelete}) (delete-category)`);

        // 2. 이 카테고리 이름을 사용하는 모든 사진 문서 찾기
        const photosQuerySnapshot = await db.collection('photos')
                                          .where('category', '==', categoryNameToDelete)
                                          .get();
        
        const photoDeletionPromises = []; // 사진 삭제 관련 Promise들을 담을 배열

        if (photosQuerySnapshot.empty) {
            console.log(`"${categoryNameToDelete}" 카테고리에 속한 사진이 없다옹. (delete-category)`);
        } else {
            console.log(`"${categoryNameToDelete}" 카테고리에서 ${photosQuerySnapshot.size}개의 사진을 발견! 삭제를 시도한다냥... (delete-category)`);
            
            photosQuerySnapshot.forEach(photoDoc => {
                const photoData = photoDoc.data();
                const photoId = photoDoc.id;
                const gcsFileName = photoData.gcsFileName; // 사진 문서에 이 필드가 존재해야 한다옹!

                // 2-A. GCS에서 실제 이미지 파일 삭제 시도
                if (gcsFileName) {
                    const file = storage.bucket(GCS_BUCKET_NAME).file(gcsFileName);
                    photoDeletionPromises.push(
                        file.delete()
                            .then(() => {
                                console.log(`GCS 파일 삭제 성공: ${gcsFileName} (사진 ID: ${photoId}) (delete-category)`);
                            })
                            .catch(err => {
                                console.error(`GCS 파일 삭제 실패: ${gcsFileName} (사진 ID: ${photoId}). 오류: ${err.message}. 파일을 찾을 수 없거나 권한 문제일 수 있다옹. (delete-category)`);
                                // 여기서 에러를 다시 throw하지 않고 로그만 남겨서, 다른 작업들은 계속 진행되도록 한다옹.
                            })
                    );
                } else {
                    console.warn(`사진 문서(ID: ${photoId})에 gcsFileName 정보가 없다옹. GCS 파일 삭제를 건너뛴다냥. (delete-category)`);
                }

                // 2-B. Firestore에서 사진 문서 삭제 시도
                photoDeletionPromises.push(
                    db.collection('photos').doc(photoId).delete()
                        .then(() => {
                            console.log(`Firestore 사진 문서 삭제 성공: ID ${photoId} (delete-category)`);
                        })
                        .catch(err => {
                            console.error(`Firestore 사진 문서(ID: ${photoId}) 삭제 실패. 오류: ${err.message}. (delete-category)`);
                            // 이것도 로그만 남긴다옹.
                        })
                );
            });
        }

        // 모든 사진 파일 및 문서 삭제 시도가 완료될 때까지 기다린다옹.
        const deletionResults = await Promise.allSettled(photoDeletionPromises);
        console.log("모든 사진 관련 삭제 작업 시도 완료. 결과:", JSON.stringify(deletionResults, null, 2), '(delete-category)');
        
        const failedGcsDeletions = deletionResults.filter(r => r.status === 'rejected' && r.reason && r.reason.message && r.reason.message.includes('GCS')); // 대략적인 실패 구분
        const failedFirestoreDeletions = deletionResults.filter(r => r.status === 'rejected' && !failedGcsDeletions.includes(r));

        if (failedGcsDeletions.length > 0 || failedFirestoreDeletions.length > 0) {
            console.warn(`사진 관련 삭제 작업 중 일부 실패: GCS ${failedGcsDeletions.length}건, Firestore 문서 ${failedFirestoreDeletions.length}건. 로그를 확인해달라냥. (delete-category)`);
            // 실패가 있더라도 일단 카테고리 삭제는 진행한다옹. (정책에 따라 다를 수 있음)
        }

        // 3. 원래 카테고리 문서 삭제
        await categoryRef.delete();
        console.log(`카테고리 문서 최종 삭제 성공! 이름: "${categoryNameToDelete}", ID: ${categoryIdToDelete} (delete-category)`);

        return {
            statusCode: 200, 
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                message: `카테고리 '${categoryNameToDelete}'(ID: ${categoryIdToDelete}) 및 관련 사진 ${photosQuerySnapshot.size}개가 성공적으로 삭제 처리되었다옹!` 
            })
        };

    } catch (error) {
        console.error(`카테고리(ID: ${categoryIdToDelete}) 및 관련 데이터 삭제 중 예상치 못한 전체 에러 발생 ㅠㅠ:`, error, '(delete-category)');
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                message: `서버 처리 중 심각한 오류 발생 (delete-category): ${error.message || '카테고리 및 관련 데이터 삭제에 실패했다옹.'}` 
            })
        };
    }
};
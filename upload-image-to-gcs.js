// netlify/functions/upload-image-to-gcs.js (Firestore 저장 기능 추가!)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin'); // Firebase Admin SDK도 필요하다옹!

let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images';

// --- GCS 초기화 (이전과 동일: 개별 환경 변수 사용) ---
const GCS_PROJECT_ID_ENV = process.env.GCS_PROJECT_ID;
const GCS_CLIENT_EMAIL_ENV = process.env.GCS_CLIENT_EMAIL;
const GCS_PRIVATE_KEY_ENV = process.env.GCS_PRIVATE_KEY;

if (GCS_PROJECT_ID_ENV && GCS_CLIENT_EMAIL_ENV && GCS_PRIVATE_KEY_ENV) {
    try {
        const gcsCredentials = {
            project_id: GCS_PROJECT_ID_ENV,
            client_email: GCS_CLIENT_EMAIL_ENV,
            private_key: GCS_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        gcsStorage = new Storage({ credentials: gcsCredentials, projectId: GCS_PROJECT_ID_ENV });
    } catch (e) {
        console.error('GCS (갤러리) 개별 환경 변수 에러:', e);
        throw new Error('GCS (갤러리) 서비스 계정 키 설정 실패!');
    }
} else {
    console.error('GCS (갤러리) 개별 환경 변수 없음!');
    throw new Error('GCS (갤러리) 서비스 계정 환경 변수 미설정!');
}

// --- Firebase Admin SDK 초기화 (개별 환경 변수 사용) ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db; // Firestore 인스턴스

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(firebaseServiceAccount) });
        }
        db = admin.firestore();
    } catch (e) {
        console.error('Firebase (갤러리 업로드) 개별 환경 변수 에러 또는 초기화 실패:', e);
    }
} else {
    console.error('Firebase (갤러리 업로드) 개별 환경 변수 없음!');
}

const parseMultipartForm = (event) => {
    // ... (이전과 동일한 parseMultipartForm 함수 내용) ...
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
        const fields = {}; let fileData = null; let fileMimeType = null; let originalFileName = null;
        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            originalFileName = fileInfo.filename; fileMimeType = fileInfo.mimeType;
            const buffers = []; fileStream.on('data', (data) => buffers.push(data));
            fileStream.on('end', () => { fileData = Buffer.concat(buffers); });
        });
        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; }); // title, category 등도 받는다옹!
        busboy.on('finish', () => { resolve({ ...fields, fileData, originalFileName, fileMimeType }); });
        busboy.on('error', err => reject(err));
        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) { busboy.end(Buffer.from(event.body, encoding)); } else { reject(new Error('요청 body 비어있음')); }
    });
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') { /* ... */ }
    if (!gcsStorage || !admin.apps.length || !db) { // db 객체도 확인!
        console.error('GCS 또는 Firebase 초기화 안됨 (갤러리 업로드)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (GCS/Firebase 초기화 실패 - 갤러리 업로드)' }) };
    }

    try {
        // 클라이언트에서 보낸 title, category도 함께 받는다옹!
        const { fileData, originalFileName, fileMimeType, title, category } = await parseMultipartForm(event);

        if (!fileData) { /* ... */ }
        if (!title || !category) { // 제목과 카테고리도 필수!
            return { statusCode: 400, body: JSON.stringify({ message: '제목과 카테고리도 필요하다옹!' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-gallery-file';
        const gcsFileName = `gallery/${Date.now()}-${safeOriginalFileName.replace(/\s+/g, '_')}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName);

        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } });
        // await file.makePublic(); // 이 줄은 이미 삭제했거나 주석 처리 되어 있어야 한다옹!

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;
        console.log(`야옹! (갤러리 GCS) 파일 업로드 성공! ${publicUrl}`);

        // --- Firestore에 사진 정보 저장! ---
        const photoDataToSave = {
            imageUrl: publicUrl,
            title: title,
            category: category,
            gcsFileName: gcsFileName, // GCS 파일 이름도 저장 (삭제 시 필요)
            createdAt: admin.firestore.FieldValue.serverTimestamp() // 업로드 시간 기록
        };

        const docRef = await db.collection('photos').add(photoDataToSave); // 'photos' 컬렉션에 새 문서 추가!
        console.log('야옹! (갤러리) 사진 정보 Firestore에 저장 성공! 문서 ID:', docRef.id);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '갤러리 사진 업로드 및 정보 저장 성공!',
                newPhoto: { id: docRef.id, ...photoDataToSave } // 새로 추가된 사진 정보 반환 (선택 사항)
            }),
        };

    } catch (error) { /* ... (이전 에러 처리와 동일, 메시지에 (갤러리 GCS/DB) 추가 가능) ... */
        console.error('Netlify Function (갤러리 GCS/DB) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (갤러리 GCS/DB): ${error.message || ''}` }) };
    }
};
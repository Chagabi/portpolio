// netlify/functions/upload-hero-image.js (Firestore 연동 부분 추가)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin'); // Firebase Admin SDK 불러오기!

// --- GCS 설정 (이전과 동일) ---
let gcsStorage; // GCS용 storage 객체 이름 변경 (Firebase와 구분)
const BUCKET_NAME = 'uucats-repository-images';
const GCS_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

if (GCS_CREDENTIALS_JSON) {
    try {
        const gcsCredentials = JSON.parse(GCS_CREDENTIALS_JSON);
        gcsStorage = new Storage({ credentials: gcsCredentials }); // 이름 변경!
        console.log('야옹! (히어로 GCS) 서비스 계정 키 성공적 로드!');
    } catch (e) { /* ... (이전 에러 처리와 동일) ... */ throw e; }
} else { /* ... (이전 에러 처리와 동일) ... */ throw new Error('GCS 환경 변수 없음!'); }

// --- Firebase Admin SDK 초기화 ---
const FIREBASE_ADMIN_CONFIG = process.env.FIREBASE_ADMIN_SDK_CONFIG_JSON;
if (FIREBASE_ADMIN_CONFIG) {
    try {
        const serviceAccount = JSON.parse(FIREBASE_ADMIN_CONFIG);
        // Firebase 앱이 이미 초기화되었는지 확인 (Netlify 함수는 상태를 유지할 수 있음)
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('야옹! Firebase Admin SDK 초기화 성공!');
        }
    } catch (e) {
        console.error('냐옹... FIREBASE_ADMIN_SDK_CONFIG_JSON 파싱 또는 Firebase 초기화 실패!', e);
        // throw new Error('Firebase Admin SDK 설정 실패!'); // 여기서 바로 에러를 던지면 함수 실행이 멈춘다냥
    }
} else {
    console.error('냐아아앙!!! FIREBASE_ADMIN_SDK_CONFIG_JSON 환경 변수를 찾을 수 없다옹!');
}

const db = admin.firestore(); // Firestore 인스턴스 가져오기

const parseMultipartForm = (event) => { /* ... (이전과 동일) ... */
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
        const fields = {}; let fileData = null; let fileMimeType = null; let originalFileName = null;
        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            originalFileName = fileInfo.filename; fileMimeType = fileInfo.mimeType;
            const buffers = []; fileStream.on('data', (data) => buffers.push(data));
            fileStream.on('end', () => { fileData = Buffer.concat(buffers); });
        });
        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => { resolve({ ...fields, fileData, originalFileName, fileMimeType }); });
        busboy.on('error', err => reject(err));
        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) { busboy.end(Buffer.from(event.body, encoding)); } else { reject(new Error('요청 body 비어있음')); }
    });
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') { /* ... */ }
    if (!gcsStorage || !admin.apps.length) { /* GCS 또는 Firebase 초기화 안됐으면 에러 처리 ... */
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (GCS 또는 Firebase 초기화 실패)' }) };
    }

    try {
        const { fileData, originalFileName, fileMimeType, heroTitle, heroSubtitle } = await parseMultipartForm(event); // title, subtitle도 받도록!

        if (!fileData) { /* ... */ }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        const fileExtension = safeOriginalFileName.includes('.') ? safeOriginalFileName.substring(safeOriginalFileName.lastIndexOf('.')) : '.jpg';
        const gcsFileName = `hero/current-hero-image${fileExtension}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName); // gcsStorage 사용!

        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } });
        // await file.makePublic(); // 이미 삭제했거나, 버킷 권한으로 처리!

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;
        console.log(`야옹! 히어로 이미지 GCS 업로드 성공! ${publicUrl}`);

        // --- Firestore에 히어로 정보 저장! ---
        const heroDataToSave = {
            imageUrl: publicUrl,
            title: heroTitle || '여기에 멋진 제목을!', // 클라이언트에서 안 보냈으면 기본값
            subtitle: heroSubtitle || '여기는 부제목을 쓰는 공간이다옹!', // 클라이언트에서 안 보냈으면 기본값
            updatedAt: admin.firestore.FieldValue.serverTimestamp() // 업데이트 시간 기록
        };

        // 'siteConfig' 컬렉션에 'hero' 라는 이름의 문서로 저장 (또는 업데이트)
        await db.collection('siteConfig').doc('hero').set(heroDataToSave, { merge: true });
        console.log('야옹! 히어로 정보 Firestore에 저장 성공!');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 이미지 업로드 및 정보 저장 성공!', publicUrl: publicUrl }),
        };

    } catch (error) { /* ... (이전 에러 처리와 동일, 메시지에 (히어로 DB) 추가 가능) ... */
        console.error('Netlify Function (히어로 GCS/DB) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (히어로 GCS/DB): ${error.message || ''}` }) };
    }
};
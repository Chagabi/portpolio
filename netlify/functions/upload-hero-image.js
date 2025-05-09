// netlify/functions/upload-hero-image.js (개별 환경 변수 사용 버전)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin');

let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images';

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
        console.error('GCS (히어로) 개별 환경 변수 에러:', e);
        throw new Error('GCS (히어로) 서비스 계정 키 설정 실패!');
    }
} else {
    console.error('GCS (히어로) 개별 환경 변수 없음!');
    throw new Error('GCS (히어로) 서비스 계정 환경 변수 미설정!');
}

const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

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
    } catch (e) {
        console.error('Firebase (히어로) 개별 환경 변수 에러 또는 초기화 실패:', e);
    }
} else {
    console.error('Firebase (히어로) 개별 환경 변수 없음!');
}

const db = admin.firestore();

const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
        const fields = {};
        let fileData = null;
        let fileMimeType = null;
        let originalFileName = null;
        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            originalFileName = fileInfo.filename;
            fileMimeType = fileInfo.mimeType;
            const buffers = [];
            fileStream.on('data', (data) => buffers.push(data));
            fileStream.on('end', () => { fileData = Buffer.concat(buffers); });
        });
        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => { resolve({ ...fields, fileData, originalFileName, fileMimeType }); });
        busboy.on('error', err => reject(err));
        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            reject(new Error('요청 body 비어있음 (히어로)'));
        }
    });
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받습니다 (히어로)' }) };
    }

    if (!gcsStorage || !admin.apps.length || !db) {
        console.error('GCS 또는 Firebase 초기화 안됨 (히어로)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (GCS/Firebase 초기화 실패 - 히어로)' }) };
    }

    try {
        const { fileData, originalFileName, fileMimeType, heroTitle, heroSubtitle } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '히어로 이미지 파일이 없습니다.' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        const fileExtension = safeOriginalFileName.includes('.') ? safeOriginalFileName.substring(safeOriginalFileName.lastIndexOf('.')) : '.jpg';
        const gcsFileName = `hero/current-hero-image${fileExtension}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName);

        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        const heroDataToSave = {
            imageUrl: publicUrl,
            title: heroTitle || '여기에 멋진 제목을!',
            subtitle: heroSubtitle || '여기는 부제목을 쓰는 공간이다옹!',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('siteConfig').doc('hero').set(heroDataToSave, { merge: true });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 이미지 업로드 및 정보 저장 성공!', publicUrl: publicUrl }),
        };

    } catch (error) {
        console.error('Netlify Function (히어로 GCS/DB) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (히어로 GCS/DB): ${error.message || ''}` }) };
    }
};
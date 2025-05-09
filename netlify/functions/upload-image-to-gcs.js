// netlify/functions/upload-image-to-gcs.js (문법 오류 수정 및 리사이즈 1920으로 복귀!)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin');
const sharp = require('sharp'); // 냐옹! sharp 라이브러리를 꼭 추가해달라옹!

let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images'; // 네 버킷 이름이 맞는지 확인!

// --- GCS 초기화 ---
const GCS_PROJECT_ID_ENV = process.env.GCS_PROJECT_ID;
const GCS_CLIENT_EMAIL_ENV = process.env.GCS_CLIENT_EMAIL;
const GCS_PRIVATE_KEY_ENV = process.env.GCS_PRIVATE_KEY;

let gcsInitializationError = null;
if (GCS_PROJECT_ID_ENV && GCS_CLIENT_EMAIL_ENV && GCS_PRIVATE_KEY_ENV) {
    try {
        const gcsCredentials = {
            project_id: GCS_PROJECT_ID_ENV,
            client_email: GCS_CLIENT_EMAIL_ENV,
            private_key: GCS_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        gcsStorage = new Storage({ credentials: gcsCredentials, projectId: GCS_PROJECT_ID_ENV });
    } catch (e) {
        gcsInitializationError = `GCS (갤러리) 서비스 계정 키 설정 실패: ${e.message}`;
        console.error(gcsInitializationError);
    }
} else {
    gcsInitializationError = 'GCS (갤러리) 서비스 계정 환경 변수 미설정!';
    console.error(gcsInitializationError);
}

// --- Firebase Admin SDK 초기화 ---
const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

let db;
let firebaseInitializationError = null;

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
        firebaseInitializationError = `Firebase (갤러리 업로드) 초기화 실패: ${e.message}`;
        console.error(firebaseInitializationError);
    }
} else {
    firebaseInitializationError = 'Firebase (갤러리 업로드) 서비스 계정 환경 변수 미설정!';
    console.error(firebaseInitializationError);
}

const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] },
            limits: { fileSize: 15 * 1024 * 1024 } // 예: 파일 크기 15MB로 제한
        });
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
            fileStream.on('error', (err) => {
                console.error('파일 스트림 읽기 에러:', err);
                reject(new Error(`파일 스트림 오류: ${err.message}`));
            });
            fileStream.on('limit', () => {
                console.warn(`파일 크기 제한 초과: ${originalFileName}`);
                reject(new Error('파일 크기가 너무 크다옹! (최대 15MB)'));
            });
        });

        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => {
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });
        busboy.on('error', err => {
            console.error('Busboy 파싱 에러:', err);
            reject(new Error(`요청 파싱 오류: ${err.message}`));
        });

        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            console.warn('요청 body가 비어있다옹. (parseMultipartForm)');
            resolve({ ...fields, fileData: null, originalFileName: null, fileMimeType: null });
        }
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다옹!' }) };
    }

    if (gcsInitializationError) {
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${gcsInitializationError}` }) };
    }
    if (firebaseInitializationError) {
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${firebaseInitializationError}` }) };
    }
    if (!gcsStorage || !db) {
        console.error('GCS 또는 Firebase 인스턴스가 여전히 초기화되지 않았다옹!');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (인스턴스 누락)' }) };
    }

    try { // 냐옹! 여기가 핸들러 전체를 감싸는 try 블록의 시작이다옹!
        const { fileData, originalFileName, fileMimeType, title, category } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '업로드할 파일이 없다옹!' }) };
        }
        if (!title || !category) {
            return { statusCode: 400, body: JSON.stringify({ message: '사진 제목과 카테고리도 모두 필요하다옹!' }) };
        }

        console.log(`야옹! 원본 파일: ${originalFileName}, MIME: ${fileMimeType}, 원본 크기: ${fileData.length / 1024} KB`);

        let processedImageBuffer;
        const targetMimeType = 'image/webp';
        let finalGcsFileName;

        // --- 냐옹! 여기가 이미지 처리를 위한 try 블록이다옹! ---
        try {
            console.log('야옹... sharp로 이미지 처리 시작이다옹!');
            const image = sharp(fileData, { failOn: 'truncated' });

            processedImageBuffer = await image
                .resize({
                    width: 1920,      // 냐옹! 리사이징 크기를 다시 1920으로!
                    height: 1920,     // 비율 유지를 위해 한쪽만 주거나, fit 옵션 활용!
                    fit: sharp.fit.inside,
                    withoutEnlargement: true
                })
                .webp({
                    quality: 80,     // 품질은 80으로 유지 (조절 가능)
                    effort: 4
                })
                .toBuffer();

            const safeOriginalName = (originalFileName || 'unknown-file').replace(/\.[^/.]+$/, "");
            finalGcsFileName = `gallery/${Date.now()}-${safeOriginalName.replace(/\s+/g, '_').substring(0, 50)}.webp`;
            console.log(`야옹! sharp로 이미지 처리 완료! 새 파일 이름: ${finalGcsFileName}, 처리 후 크기: ${processedImageBuffer.length / 1024} KB`);

        } catch (sharpError) { // 냐옹! 여기가 이미지 처리 try에 대한 catch 블록이다옹!
            console.error("!!!!! SHARP 이미지 처리 중 심각한 에러 !!!!!");
            console.error("Sharp 에러 객체 전체:", JSON.stringify(sharpError, Object.getOwnPropertyNames(sharpError), 2));
            return {
                statusCode: 422,
                body: JSON.stringify({ message: `이미지 처리 중 문제가 발생했다옹. 파일이 너무 크거나 지원하지 않는 형식일 수 있다냥. (에러: ${sharpError.message})` })
            };
        } // 냐옹! 여기가 이미지 처리 try...catch의 끝이다옹!

        const file = gcsStorage.bucket(BUCKET_NAME).file(finalGcsFileName);

        await file.save(processedImageBuffer, {
            metadata: { contentType: targetMimeType }
        });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${finalGcsFileName}`;
        console.log(`야옹! (갤러리 GCS) 처리된 파일 업로드 성공! ${publicUrl}`);

        const photoDataToSave = {
            imageUrl: publicUrl,
            title: title,
            category: category,
            gcsFileName: finalGcsFileName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            originalFileName: originalFileName,
            originalMimeType: fileMimeType,
            fileSizeKB: Math.round(processedImageBuffer.length / 1024)
        };

        const docRef = await db.collection('photos').add(photoDataToSave);
        console.log('야옹! (갤러리) 사진 정보 Firestore에 저장 성공! 문서 ID:', docRef.id);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '갤러리 사진 업로드 및 정보 저장 성공!',
                newPhoto: { id: docRef.id, ...photoDataToSave }
            }),
        };

    } catch (error) { // 냐옹! 여기가 핸들러 전체를 감싸는 try에 대한 catch 블록이다옹!
        console.error('Netlify Function (갤러리 업로드 핸들러) 에러:', error);
        let statusCode = 500;
        let errorMessage = error.message || '알 수 없는 서버 오류가 발생했다옹.';

        if (error.message && (error.message.includes('파일 크기가 너무 크다옹') || error.message.includes('파일 스트림 오류') || error.message.includes('요청 파싱 오류'))) {
            statusCode = 400;
            if (error.message.includes('파일 크기가 너무 크다옹')) statusCode = 413;
        }
        
        return {
            statusCode: statusCode,
            body: JSON.stringify({ message: errorMessage })
        };
    } // 냐옹! 여기가 핸들러 전체 try...catch의 끝이다옹!
};
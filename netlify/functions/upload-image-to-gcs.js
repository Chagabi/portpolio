// netlify/functions/upload-image-to-gcs.js (sharp로 이미지 처리 추가된 최종 버전이다옹!)

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

let gcsInitializationError = null; // GCS 초기화 에러를 저장할 변수
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
let firebaseInitializationError = null; // Firebase 초기화 에러를 저장할 변수

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

// 멀티파트 폼 데이터 파싱 함수 (좀 더 꼼꼼하게 에러 처리!)
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] },
            limits: { fileSize: 15 * 1024 * 1024 } // 예: 파일 크기 15MB로 제한 (조절 가능)
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
                reject(new Error(`파일 스트림 오류: ${err.message}`)); // 구체적인 에러 메시지
            });
            fileStream.on('limit', () => { // 파일 크기 제한 초과 시
                console.warn(`파일 크기 제한 초과: ${originalFileName}`);
                reject(new Error('파일 크기가 너무 크다옹! (최대 15MB)'));
            });
        });

        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => {
            if (!fileData && Object.keys(fields).length === 0 && !originalFileName) { // 아무것도 없는 요청인지 확인
                 // 이 경우는 파일 없는 요청으로 간주하고 빈 객체 resolve (핸들러에서 추가 판단)
                 console.warn('Busboy finish: 파일이나 필드가 전혀 없다옹.');
            }
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });
        busboy.on('error', err => {
            console.error('Busboy 파싱 에러:', err);
            reject(new Error(`요청 파싱 오류: ${err.message}`)); // 구체적인 에러 메시지
        });

        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            // body가 없는 요청은 파일 업로드가 아니므로, reject보다는 빈 객체 resolve 후 핸들러에서 판단
            console.warn('요청 body가 비어있다옹. (parseMultipartForm)');
            resolve({ ...fields, fileData: null, originalFileName: null, fileMimeType: null });
        }
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다옹!' }) };
    }

    // 핸들러 시작 시 초기화 에러 확인
    if (gcsInitializationError) {
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${gcsInitializationError}` }) };
    }
    if (firebaseInitializationError) {
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${firebaseInitializationError}` }) };
    }
    if (!gcsStorage || !db) { // 최종적으로 다시 한번 확인
        console.error('GCS 또는 Firebase 인스턴스가 여전히 초기화되지 않았다옹!');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (인스턴스 누락)' }) };
    }


    try {
        const { fileData, originalFileName, fileMimeType, title, category } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '업로드할 파일이 없다옹!' }) };
        }
        if (!title || !category) {
            return { statusCode: 400, body: JSON.stringify({ message: '사진 제목과 카테고리도 모두 필요하다옹!' }) };
        }

        console.log(`야옹! 원본 파일: ${originalFileName}, MIME: ${fileMimeType}, 원본 크기: ${fileData.length / 1024} KB`);

        // --- 냐옹! 이미지 처리 (sharp 사용) ---
        let processedImageBuffer;
        const targetMimeType = 'image/webp'; // WEBP로 변환할 거다옹!
        let finalGcsFileName;

        try {
            console.log('야옹... sharp로 이미지 처리 시작이다옹!');
            const image = sharp(fileData, { failOn: 'truncated' }); // 손상된 이미지면 에러 발생시키기

            // 이미지 크기를 조절한다옹.
            processedImageBuffer = await image
                .resize({
                    width: 1280,      // 최대 가로 크기
                    height: 1280,     // 최대 세로 크기
                    fit: sharp.fit.inside, // 이미지가 이 크기 안에 딱 맞게 (비율 유지)
                    withoutEnlargement: true // 원본보다 작을 때만 리사이즈 (확대 방지)
                })
                .webp({ // WEBP로 변환하고 품질 설정
                    quality: 80,     // 0-100 사이, 웹에서는 75-85 정도면 충분하다냥
                    effort: 4        // 압축 노력 (0-6, 높을수록 느리지만 압축률 향상)
                })
                .toBuffer(); // 처리된 이미지를 버퍼로 만든다옹

            // 새 파일 이름 (확장자 .webp로 변경)
            const safeOriginalName = (originalFileName || 'unknown-file').replace(/\.[^/.]+$/, ""); // 원본 확장자 제거
            finalGcsFileName = `gallery/${Date.now()}-${safeOriginalName.replace(/\s+/g, '_').substring(0, 50)}.webp`; // 너무 길지 않게 자르기
            console.log(`야옹! sharp로 이미지 처리 완료! 새 파일 이름: ${finalGcsFileName}, 처리 후 크기: ${processedImageBuffer.length / 1024} KB`);

        } catch (sharpError) {
            console.error("!!!!! SHARP 이미지 처리 중 심각한 에러 !!!!!", sharpError);
            console.error("에러 상세 정보:", JSON.stringify(sharpError, null, 2));
            // sharp 에러 시, 클라이언트에게 JSON 형태로 에러를 알려준다옹!
            return {
                statusCode: 422, // Unprocessable Entity (이미지 처리 불가)
                body: JSON.stringify({ message: `이미지 처리 중 문제가 발생했다옹: ${sharpError.message || '알 수 없는 이미지 변환 오류'}. 다른 파일을 시도해보라옹.` })
            };
        }
        // --- 이미지 처리 끝 ---

        const file = gcsStorage.bucket(BUCKET_NAME).file(finalGcsFileName);

        await file.save(processedImageBuffer, {
            metadata: { contentType: targetMimeType } // 최종 MIME 타입 (image/webp) 사용!
        });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${finalGcsFileName}`;
        console.log(`야옹! (갤러리 GCS) 처리된 파일 업로드 성공! ${publicUrl}`);

        const photoDataToSave = {
            imageUrl: publicUrl,
            title: title,
            category: category,
            gcsFileName: finalGcsFileName, // 처리된 GCS 파일 이름 저장
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            originalFileName: originalFileName, // 원본 파일 이름도 기록 (선택 사항)
            originalMimeType: fileMimeType,   // 원본 MIME 타입도 기록 (선택 사항)
            fileSizeKB: Math.round(processedImageBuffer.length / 1024) // 처리 후 파일 크기 (선택 사항)
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

    } catch (error) {
        console.error('Netlify Function (갤러리 업로드 핸들러) 에러:', error);
        let statusCode = 500;
        let errorMessage = error.message || '알 수 없는 서버 오류가 발생했다옹.';

        // Busboy에서 reject된 에러 (예: 파일 크기 초과)는 message에 이미 내용이 있다옹.
        if (error.message && (error.message.includes('파일 크기가 너무 크다옹') || error.message.includes('파일 스트림 오류') || error.message.includes('요청 파싱 오류'))) {
            statusCode = 400; // Bad Request 또는 413 Payload Too Large
            if(error.message.includes('파일 크기가 너무 크다옹')) statusCode = 413;
        }
        
        return { 
            statusCode: statusCode, 
            body: JSON.stringify({ message: errorMessage }) 
        };
    }
};
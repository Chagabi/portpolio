// netlify/functions/upload-hero-image.js (로그 강화 및 필드 이름 확인)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin');
// const sharp = require('sharp'); // 냐옹! 히어로 이미지에도 sharp를 쓰고 싶다면 주석 해제하고 설치!

let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images';

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
        gcsInitializationError = `GCS (히어로) 초기화 실패: ${e.message}`;
        console.error(gcsInitializationError);
    }
} else {
    gcsInitializationError = 'GCS (히어로) 환경 변수 미설정!';
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
        firebaseInitializationError = `Firebase (히어로) 초기화 실패: ${e.message}`;
        console.error(firebaseInitializationError);
    }
} else {
    firebaseInitializationError = 'Firebase (히어로) 환경 변수 미설정!';
    console.error(firebaseInitializationError);
}

const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        console.log('[parseMultipartForm] 히어로 이미지 처리 시작! Content-Type:', event.headers['content-type'] || event.headers['Content-Type']);
        const busboy = Busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] },
            limits: { fileSize: 10 * 1024 * 1024 } // 예: 히어로 이미지는 10MB 제한
        });
        const fields = {}; // 폼 필드 저장 (heroTitle, heroSubtitle)
        let fileDataBuffer = null; // 파일 데이터를 Buffer로 저장
        let receivedFileMimeType = null;
        let receivedOriginalFileName = null;
        let fileStreamProcessed = false; // 파일 스트림 처리 완료 여부

        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            // 클라이언트에서 formData.append('imageFile', file); 이렇게 보냈으니, fieldname은 'imageFile'이어야 한다옹!
            console.log(`[parseMultipartForm] 'file' 이벤트! 필드명: ${fieldname}, 파일명: ${fileInfo.filename}, MIME: ${fileInfo.mimeType}`);
            
            // 냐옹! 여기서 fieldname이 우리가 클라이언트에서 정한 'imageFile'이 맞는지 확인!
            if (fieldname === 'imageFile') {
                receivedOriginalFileName = fileInfo.filename;
                receivedFileMimeType = fileInfo.mimeType;
                const buffers = [];
                fileStream.on('data', (data) => {
                    console.log(`[parseMultipartForm] 파일 데이터 수신 중... 크기: ${data.length}`);
                    buffers.push(data);
                });
                fileStream.on('end', () => {
                    fileDataBuffer = Buffer.concat(buffers);
                    fileStreamProcessed = true;
                    console.log(`[parseMultipartForm] 파일 데이터 수신 완료! 최종 버퍼 크기: ${fileDataBuffer ? fileDataBuffer.length : 'null'}`);
                });
                fileStream.on('error', (err) => {
                    console.error('[parseMultipartForm] 파일 스트림 에러:', err);
                    reject(new Error(`파일 스트리밍 중 오류: ${err.message}`));
                });
                fileStream.on('limit', () => {
                    console.warn(`[parseMultipartForm] 파일 크기 제한 초과: ${receivedOriginalFileName}`);
                    reject(new Error('히어로 이미지 파일 크기가 너무 크다옹! (최대 10MB)'));
                });
            } else {
                // 'imageFile'이 아닌 다른 이름으로 파일이 오면 일단 받되, 로그를 남긴다옹.
                console.warn(`[parseMultipartForm] 예상치 못한 파일 필드명: ${fieldname}. 이 파일은 무시된다옹.`);
                fileStream.resume(); // 스트림을 소비해서 'finish' 이벤트가 막히지 않도록!
            }
        });

        busboy.on('field', (fieldname, val) => {
            console.log(`[parseMultipartForm] 'field' 이벤트! 필드명: ${fieldname}, 값: ${val.substring(0,100)}...`); // 값 너무 길면 잘라서 로깅
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            console.log(`[parseMultipartForm] 'finish' 이벤트! 수집된 필드:`, Object.keys(fields));
            console.log(`[parseMultipartForm] 'finish' 이벤트! 최종 fileDataBuffer 상태: ${fileDataBuffer ? '데이터 있음' : '데이터 없음'}`);
            // fileDataBuffer가 null이더라도 (파일이 없거나 잘못된 필드명으로 왔더라도) 일단 resolve는 한다옹.
            // 실제 파일 존재 유무는 핸들러에서 fileDataBuffer 값으로 판단!
            resolve({ 
                fileData: fileDataBuffer, // 냐옹! 여기서 fileData라는 이름으로 버퍼를 넘겨준다옹!
                originalFileName: receivedOriginalFileName, 
                fileMimeType: receivedFileMimeType, 
                // fields 객체에 heroTitle, heroSubtitle 등이 들어있을 거다옹.
                // 핸들러에서 구조 분해 할당할 때 이 이름들을 사용해야 한다냥.
                heroTitle: fields.heroTitle, 
                heroSubtitle: fields.heroSubtitle 
            });
        });

        busboy.on('error', err => {
            console.error('[parseMultipartForm] Busboy 파싱 중 에러:', err);
            reject(new Error(`요청 파싱 중 오류: ${err.message}`));
        });

        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            console.log('[parseMultipartForm] event.body 있음, busboy.end() 호출.');
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            console.warn('[parseMultipartForm] event.body가 비어있다옹! 파일 없이 resolve 시도.');
            resolve({ 
                fileData: null, 
                originalFileName: null, 
                fileMimeType: null, 
                heroTitle: fields.heroTitle, 
                heroSubtitle: fields.heroSubtitle 
            });
        }
    });
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받습니다 (히어로)' }) };
    }

    if (gcsInitializationError || firebaseInitializationError || !gcsStorage || !db) {
        const initErrorMsg = gcsInitializationError || firebaseInitializationError || 'GCS/Firebase 인스턴스 누락';
        console.error(`초기화 오류 (히어로): ${initErrorMsg}`);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 설정 오류: ${initErrorMsg}` }) };
    }

    try {
        // 냐옹! parseMultipartForm에서 resolve하는 객체의 키 이름과 동일하게 구조 분해 할당해야 한다냥!
        // 이전에는 fileData, originalFileName, fileMimeType, heroTitle, heroSubtitle 이렇게 바로 받았지만,
        // parseMultipartForm의 resolve 객체 구조에 맞춰서 수정!
        const parsedForm = await parseMultipartForm(event);
        const fileData = parsedForm.fileData; // 이렇게 명시적으로 꺼내 쓰자옹!
        const originalFileName = parsedForm.originalFileName;
        const fileMimeType = parsedForm.fileMimeType;
        const heroTitle = parsedForm.heroTitle; // fields에서 온 값
        const heroSubtitle = parsedForm.heroSubtitle; // fields에서 온 값

        console.log('[handler] parseMultipartForm 결과:', { 
            hasFileData: !!fileData, 
            originalFileName, 
            fileMimeType, 
            heroTitle: heroTitle ? heroTitle.substring(0,30)+'...' : undefined, // 너무 길면 잘라서 로깅
            heroSubtitle: heroSubtitle ? heroSubtitle.substring(0,30)+'...' : undefined 
        });

        if (!fileData) { // 냐옹! 이제 fileData가 null인지 아닌지로 판단!
            console.error('[handler] 히어로 이미지 파일 데이터가 없습니다.');
            return { statusCode: 400, body: JSON.stringify({ message: '히어로 이미지 파일이 없습니다.' }) };
        }

        // (선택 사항) 히어로 이미지에 sharp 처리 (큰 이미지 대비)
        // let bufferToSave = fileData;
        // let mimeTypeToSave = fileMimeType || 'application/octet-stream';
        // try {
        //     console.log('[handler] 히어로 이미지 sharp 처리 시도...');
        //     const image = sharp(fileData, { failOn: 'truncated' });
        //     bufferToSave = await image
        //         .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        //         .webp({ quality: 80 }) // 히어로는 WEBP보다는 원본 유지나 JPG가 나을 수도 있다냥.
        //         .toBuffer();
        //     mimeTypeToSave = 'image/webp'; // 또는 sharp 결과에 따라
        //     console.log(`[handler] 히어로 이미지 sharp 처리 완료. 새 크기: ${bufferToSave.length / 1024} KB`);
        // } catch (sharpError) {
        //     console.warn('[handler] 히어로 이미지 sharp 처리 실패 (원본 사용):', sharpError.message);
        //     // sharp 실패 시 원본을 그대로 사용하거나, 에러를 반환할 수 있다옹.
        //     // 여기서는 일단 원본 사용으로 진행 (선택적)
        // }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        const fileExtensionMatch = safeOriginalFileName.match(/\.([^.]+)$/);
        const fileExtension = fileExtensionMatch ? fileExtensionMatch[0].toLowerCase() : '.jpg'; // 확장자 없으면 .jpg 기본

        // 냐옹! GCS 파일 이름에 타임스탬프 추가 (캐시 방지 및 덮어쓰기 방지)
        const gcsFileName = `hero/hero-image-${Date.now()}${fileExtension}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName);

        // await file.save(bufferToSave, { metadata: { contentType: mimeTypeToSave } }); // sharp 사용 시
        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } }); // 원본 저장 시

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;
        console.log(`[handler] 새 히어로 이미지 GCS 업로드 성공: ${publicUrl}`);

        const heroDataToSave = {
            imageUrl: publicUrl,
            title: heroTitle || DEFAULT_HERO_TITLE, // 클라이언트에 정의된 기본값 사용 고려
            subtitle: heroSubtitle || DEFAULT_HERO_SUBTITLE, // 클라이언트에 정의된 기본값 사용 고려
            gcsFileName: gcsFileName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('siteConfig').doc('hero').set(heroDataToSave);
        console.log('[handler] Firestore에 새 히어로 정보 저장 완료:', heroDataToSave);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 이미지 업로드 및 정보 저장 성공!', publicUrl: publicUrl, newData: heroDataToSave }),
        };

    } catch (error) { // parseMultipartForm에서 reject된 에러 또는 핸들러 내부 다른 에러
        console.error('Netlify Function (upload-hero-image) 최종 에러 캐치:', error);
        let statusCode = 500;
        let errorMessage = error.message || '알 수 없는 서버 오류 (히어로)';
        if (error.message && (error.message.includes('파일 크기가 너무 크다옹') || error.message.includes('파일 스트림 오류') || error.message.includes('요청 파싱 오류'))) {
            statusCode = 400; // 또는 413
            if(error.message.includes('파일 크기가 너무 크다옹')) statusCode = 413;
        }
        return { statusCode: statusCode, body: JSON.stringify({ message: errorMessage }) };
    }
};

// 클라이언트 index.html에 있는 DEFAULT_HERO_TITLE, DEFAULT_HERO_SUBTITLE과 동일한 값을 여기서도 정의해두면 좋다옹.
const DEFAULT_HERO_TITLE = '여기에 멋진 제목을!';
const DEFAULT_HERO_SUBTITLE = '여기는 부제목을 쓰는 공간이다옹!';
// netlify/functions/upload-image-to-gcs.js (개별 환경 변수 사용 버전)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy'); // 파일 처리 도우미!

let gcsStorage; // GCS용 storage 객체 이름 (다른 SDK와 구분하기 위해 gcsStorage로!)
const BUCKET_NAME = 'uucats-repository-images'; // 네 버킷 이름, 아주 잘 넣었다옹! 👍

// Netlify 환경 변수에서 GCS 접속 정보 (개별) 읽어오기
const GCS_PROJECT_ID_ENV = process.env.GCS_PROJECT_ID;
const GCS_CLIENT_EMAIL_ENV = process.env.GCS_CLIENT_EMAIL;
// private_key는 여러 줄일 수 있고, Netlify 환경 변수에서는 \n이 \\n으로 저장될 수 있다옹.
const GCS_PRIVATE_KEY_ENV = process.env.GCS_PRIVATE_KEY;

if (GCS_PROJECT_ID_ENV && GCS_CLIENT_EMAIL_ENV && GCS_PRIVATE_KEY_ENV) {
    try {
        const gcsCredentials = {
            project_id: GCS_PROJECT_ID_ENV,
            client_email: GCS_CLIENT_EMAIL_ENV,
            // Netlify에서 \n이 \\n (두 글자)로 저장될 수 있으므로, 다시 \n (줄바꿈 한 글자)으로 바꿔준다옹!
            private_key: GCS_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        // projectId를 명시적으로 전달해주는 것이 좋다옹.
        gcsStorage = new Storage({ credentials: gcsCredentials, projectId: GCS_PROJECT_ID_ENV });
        console.log('야옹! (갤러리 GCS) 서비스 계정 키 (개별) 성공적 로드!');
    } catch (e) {
        console.error('냐옹... (갤러리 GCS) 개별 환경 변수 사용 중 에러 발생! Netlify 환경 변수 설정을 확인해달라냥!', e);
        // 여기서 에러를 던져서 함수 실행을 중단시키는 게 좋다옹.
        throw new Error('GCS 서비스 계정 키 (개별) 설정 또는 파싱 실패!');
    }
} else {
    console.error('냐아아앙!!! (갤러리 GCS) 개별 환경 변수 (GCS_PROJECT_ID, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY) 중 일부 또는 전체가 없다옹! Netlify 설정을 확인해달라냥!');
    throw new Error('GCS 서비스 계정 (개별) 환경 변수가 설정되지 않았다옹!');
}


// Busboy로 multipart/form-data 파싱하는 헬퍼 함수다옹 (이전과 동일)
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: {
                'content-type': event.headers['content-type'] || event.headers['Content-Type']
            }
        });
        const fields = {};
        let fileData = null;
        let fileMimeType = null;
        let originalFileName = null;

        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            originalFileName = fileInfo.filename;
            fileMimeType = fileInfo.mimeType;
            const buffers = [];
            fileStream.on('data', (data) => {
                buffers.push(data);
            });
            fileStream.on('end', () => {
                fileData = Buffer.concat(buffers);
            });
        });

        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });

        busboy.on('error', err => {
            console.error('Busboy (갤러리 GCS) 파싱 중 에러 발생이다옹!', err);
            reject(err);
        });

        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            reject(new Error('요청 body가 비어있다옹! (갤러리 GCS) 파일이 제대로 전달되지 않은 것 같다냥.'));
        }
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다냥! (갤러리 GCS)' }) };
    }

    // gcsStorage 객체가 성공적으로 초기화되었는지 한번 더 확인한다옹.
    if (!gcsStorage) {
        console.error('냐옹! (갤러리 GCS) Storage 객체가 초기화되지 않아서 파일 업로드를 진행할 수 없다옹!');
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '서버 내부 설정 오류다옹. (갤러리 GCS) 관리자 고양이에게 문의해달라냥!' }),
        };
    }

    try {
        // 갤러리 업로드 시에는 title, category도 함께 받는다옹.
        const { fileData, originalFileName, fileMimeType, title, category, imageType /* 히어로 이미지 구분용, 여기선 사용 안함 */ } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '이미지 파일이 없다옹! (갤러리 GCS) 다시 확인해달라냥!' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-gallery-file';
        // 갤러리 이미지는 'gallery/' 폴더에 저장한다옹.
        const gcsFileName = `gallery/${Date.now()}-${safeOriginalFileName.replace(/\s+/g, '_')}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName); // gcsStorage 사용!

        await file.save(fileData, {
            metadata: { contentType: fileMimeType || 'application/octet-stream' },
        });

        // await file.makePublic(); // 이 줄은 버킷이 균일 액세스이고 allUsers 뷰어 권한이 있다면 필요 없다옹!
                                // 그리고 이미 삭제하기로 결정했으니 여기서도 없어야 한다냥!

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        console.log(`야옹! (갤러리 GCS) 파일 업로드 성공! ${publicUrl}`);

        // (중요!) 여기서 갤러리 사진 정보를 Firestore에 저장하는 로직이 추가되어야 한다옹!
        // 예를 들어, publicUrl, title, category, gcsFileName 등을 DB에 저장!
        // 지금은 클라이언트에게 URL만 넘겨주고, 클라이언트가 localStorage에 저장하고 있다냥.
        // 이 부분도 나중에는 Firestore 연동으로 바꿔야 완벽해진다옹!

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '파일 업로드 성공이다옹! 냐항! (갤러리 GCS)',
                publicUrl: publicUrl,
                fileNameInGCS: gcsFileName,
                // 클라이언트에서 사용할 수 있도록 title, category도 다시 보내주면 좋다냥.
                title: title,
                category: category
            }),
        };

    } catch (error) {
        console.error('Netlify Function (갤러리 GCS) 파일 업로드 중 심각한 에러 발생이다옹!', error);
        let errorMessage = '서버에서 야옹... (갤러리 GCS) 알 수 없는 문제가 생겼다옹.';
        if (error instanceof Error) { errorMessage = `서버에서 야옹... (갤러리 GCS) 문제가 생겼다옹: ${error.message}`; }
        else if (typeof error === 'string') { errorMessage = `서버에서 야옹... (갤러리 GCS) 문제가 생겼다옹: ${error}`; }
        return { statusCode: 500, body: JSON.stringify({ message: errorMessage }) };
    }
};
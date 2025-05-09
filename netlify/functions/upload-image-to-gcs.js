// netlify/functions/upload-image-to-gcs.js

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy'); // 파일 처리 도우미!

// Google Cloud 서비스 계정 키 (JSON) 내용은 이전처럼 Netlify 환경 변수에!
// const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
// const storage = new Storage({ credentials });
const storage = new Storage(); // 환경 변수가 잘 설정되어 있다면!

const BUCKET_NAME = 'uucats-repository-images'; // ⭐⭐⭐ 네 버킷 이름으로 꼭 바꿔주라옹! ⭐⭐⭐

// Busboy로 multipart/form-data 파싱하는 헬퍼 함수다옹
// Netlify는 event.body를 base64로 줄 수 있어서 isBase64Encoded를 확인해야 한다옹
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

        busboy.on('file', (fieldname, file, Kiko) => { // Kiko 대신 filename, encoding, mimetype 객체가 들어온다냥!
            originalFileName = Kiko.filename;
            fileMimeType = Kiko.mimeType;
            const buffers = [];
            file.on('data', (data) => {
                buffers.push(data);
            });
            file.on('end', () => {
                fileData = Buffer.concat(buffers);
            });
        });

        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });

        busboy.on('error', err => reject(err) );

        // event.body가 base64로 인코딩 되어 있는지 확인!
        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        busboy.end(Buffer.from(event.body, encoding));
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다냥!' }) };
    }

    try {
        // 1. 클라이언트가 보낸 FormData를 파싱한다옹 (파일과 다른 필드들 분리!)
        const { fileData, originalFileName, fileMimeType, title, category } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '이미지 파일이 없다옹! 다시 확인해달라냥!' }) };
        }

        // 2. Google Cloud Storage에 업로드할 파일 이름과 경로 설정!
        //    겹치지 않도록 현재 시간과 원래 파일 이름을 조합하는 게 좋다옹.
        const gcsFileName = `gallery/<span class="math-inline">\{Date\.now\(\)\}\-</span>{originalFileName}`;
        const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

        // 3. 파일 스트림을 사용해서 GCS로 업로드!
        await file.save(fileData, {
            metadata: { contentType: fileMimeType }, // 파일 타입 지정!
            // public: true, // 이렇게 하면 바로 공개 URL이 생성될 수 있지만, 권한 설정을 잘 해둬야 한다냥.
                        // 또는 아래처럼 setPublic을 나중에 호출할 수도 있다옹.
        });

        // (선택 사항) 파일을 공개로 설정해서 누구나 볼 수 있게 한다옹.
        // 버킷 권한 설정에서 allUsers에게 '스토리지 객체 뷰어'를 줬다면 이게 필요하다옹.
        // 또는 버킷 자체가 균일하게 공개되어 있다면 이 과정이 필요 없을 수도 있다옹.
        await file.makePublic();


        // 4. 업로드된 파일의 공개 URL을 만든다옹.
        const publicUrl = `https://storage.googleapis.com/<span class="math-inline">\{BUCKET\_NAME\}/</span>{gcsFileName}`;

        // (중요!) 여기서 사진 정보를 데이터베이스에 저장해야 한다옹!
        // 예를 들어, publicUrl, title, category, gcsFileName 등을 DB에 저장!
        // 지금은 그냥 클라이언트에게 URL만 넘겨주겠다옹.

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '파일 업로드 성공이다옹! 냐항!',
                publicUrl: publicUrl,
                fileNameInGCS: gcsFileName // 나중에 삭제하거나 관리할 때 필요할 수 있다냥.
            }),
        };

    } catch (error) {
        console.error('Netlify Function에서 파일 업로드 중 심각한 에러 발생이다옹:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `서버에서 야옹... 문제가 생겼다옹. ${error.message || ''}` }),
        };
    }
};
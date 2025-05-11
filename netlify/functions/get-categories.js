// netlify/functions/get-categories.js

// 공통 Firebase 모듈 가져오기
const { getFirestore } = require('./utils/firebase-admin');

exports.handler = async (event, context) => {
  // HTTP 메소드 확인
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: 'GET 요청만 허용된다옹! (get-categories)' })
    };
  }

  try {
    // 공통 모듈에서 Firestore 인스턴스 가져오기
    const db = getFirestore();
    
    // 이후 코드는 기존과 동일
    const categoriesSnapshot = await db.collection('categories').orderBy('name').get();

    const categories = [];
    categoriesSnapshot.forEach(doc => {
      categories.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`총 ${categories.length}개의 카테고리 정보를 가져왔습니다.`);
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600" // 1시간 캐싱 추가
      },
      body: JSON.stringify(categories)
    };

  } catch (error) {
    console.error('카테고리 목록 읽기 에러:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: `서버 에러: ${error.message || '알 수 없는 오류'}` })
    };
  }
};
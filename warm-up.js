// netlify/functions/warm-up.js
const fetch = require('node-fetch');

// 워밍업할 함수 목록
const functionsToWarm = [
  'get-categories',
  'get-hero-info',
  'get-photos'
  // 필요에 따라 다른 함수 추가
];

exports.handler = async (event) => {
  try {
    // 함수의 URL 생성 (배포된 Netlify 사이트 기준)
    const baseUrl = process.env.URL || 'https://uucats.net';
    
    // 모든 함수에 대해 병렬로 요청 실행
    const warmupPromises = functionsToWarm.map(async (functionName) => {
      const url = `${baseUrl}/.netlify/functions/${functionName}`;
      const startTime = Date.now();
      
      try {
        const response = await fetch(url);
        const endTime = Date.now();
        return {
          function: functionName,
          status: response.status,
          time: endTime - startTime,
          success: response.status >= 200 && response.status < 300
        };
      } catch (error) {
        return {
          function: functionName,
          status: 'error',
          error: error.message,
          success: false
        };
      }
    });

    const results = await Promise.all(warmupPromises);
    console.log('워밍업 결과:', JSON.stringify(results, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: '워밍업 완료',
        results 
      })
    };
  } catch (error) {
    console.error('워밍업 오류:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '워밍업 처리 중 오류 발생' })
    };
  }
};
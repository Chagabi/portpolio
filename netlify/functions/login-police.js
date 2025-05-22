// 이 파일은 netlify/functions/login-police.js 에 저장한다옹!
exports.handler = async function(event) {
  // 중요한 건 POST 요청으로만 받는다옹! 다른 건 안돼냥!
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "냐옹? 잘못된 요청이다냥!" };
  }

  try {
    const data = JSON.parse(event.body); // 사용자가 보낸 아이디/비번 정보다옹
    const usernameFromUser = data.username;
    const passwordFromUser = data.password;

    // 넷리파이 비밀 주머니에서 진짜 아이디/비번 꺼내오기!
    // process.env.설정한_환경변수_이름 이다냥!
    const realAdminUser = process.env.MY_CAT_USER;
    const realAdminPass = process.env.MY_CAT_PASS;

    if (usernameFromUser === realAdminUser && passwordFromUser === realAdminPass) {
      // 성공! 문을 열어준다옹! 😻
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: "로그인 성공이다냥! 환영한다옹!" })
      };
    } else {
      // 실패! 넌 누구냥! 😾
      return {
        statusCode: 401, // 401은 허가되지 않았다는 뜻이다냥!
        body: JSON.stringify({ success: false, message: "아이디나 비밀번호가 틀렸다냥! 다시 해보라옹!" })
      };
    }
  } catch (error) {
    // 뭔가 와장창 깨졌을 때다옹 😿
    console.error("로그인 처리 중 에러냥:", error);
    return {
      statusCode: 500, // 500은 서버가 아야할 때다냥!
      body: JSON.stringify({ success: false, message: "서버가 지금 좀 아프다냥... 미안하다옹..." })
    };
  }
};
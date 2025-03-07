<!DOCTYPE html>
<html>
<head>
  <title>login-test</title>
  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-auth-compat.js"></script>
  <style>
    .step { display: none; margin: 10px 0; }
    .active { display: block; }
  </style>
</head>
<body>
  <!-- 登录界面 -->
  <div id="step-login" class="step active">
    <input type="email" id="email" placeholder="email">
    <input type="password" id="password" placeholder="password">
    <button onclick="startLogin()">login</button>
  </div>

  <!-- MFA注册界面 -->
  <div id="step-register-mfa" class="step">
    <p>register phone number</p>
    <input type="tel" id="phone" placeholder="+8613912345678">
    <button onclick="registerMFA()">get mfa register sms code</button>
    <!-- reCAPTCHA 容器 -->
    <div id="recaptcha-container"></div>
  </div>

  <!-- MFA验证界面 -->
  <div id="step-verify-mfa" class="step">
    <input type="text" id="sms-code" placeholder="sms code">
    <button onclick="verifySMSCode()">verify</button>
  </div>

  <div id="message"></div>

<script>
const firebaseConfig = {
    apiKey: "AIzaSyCvNvCD-JZjVikinORUB5KVKVSyq6D7LZQ",
    authDomain: "river-cocoa-452212-g5.firebaseapp.com",
    projectId: "river-cocoa-452212-g5",
    storageBucket: "river-cocoa-452212-g5.firebasestorage.app",
    messagingSenderId: "226130398687",
    appId: "1:226130398687:web:800a3ace8718b16e39486a"
};

let auth;
let recaptchaVerifier;
let currentVerificationId; // 用于 MFA 注册流程中存储验证码ID
// 全局保存 MFA 登录流程的 resolver 和验证码ID
window.mfaResolver = null;
window.mfaVerificationId = null;

function initialize() {
  const app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth(app);
  auth.useDeviceLanguage();
  
  // 根据官方推荐初始化 reCAPTCHA，附带回调
  recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    size: 'invisible',
    callback: (response) => {
      console.log("reCAPTCHA verify success...");
      // TODO startMfaVerification(response);
    },
    'expired-callback': () => {
      console.log("reCAPTCHA verify faild pls login again!");
      recaptchaVerifier.reset(window.recaptchaWidgetId);
    }
  });
  
  recaptchaVerifier.render().then(function(widgetId) {
    window.recaptchaWidgetId = widgetId;
  });
}
window.onload = initialize;

// 登录流程：先用邮箱密码登录
async function startLogin() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    showMessage('登录中...');
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
 
    // 如果邮箱未验证，则发送验证邮件并退出
    if (!user.emailVerified) {
      await user.sendEmailVerification();
      showMessage('check email ling...');
      await auth.signOut();
      return;
    }
    
    // 如果当前用户未注册 MFA，进入注册流程
    if (user.multiFactor.enrolledFactors.length === 0) {
      switchStep('step-register-mfa');
      showMessage('frist register phone number');
      await auth.signOut();
      return;
    } else {
      // 理论上 MFA 用户的登录会在 signInWithEmailAndPassword 时抛出 multi-factor-auth-required 错误
      // 如果走到这里，则直接登录成功
      showMessage('sucess login---123');
      // 可以在这里跳转到主页面
    }
  } catch (error) {
    if (error.code === 'auth/multi-factor-auth-required') {
      console.info('enter-------sms code ----')
      // 捕获 MFA 要求错误，并开始 MFA 登录验证流程
      startMFAVerification(error.resolver);
    } else {
      handleAuthError(error);
    }
  }
}

// MFA 注册流程：为当前用户绑定手机
async function registerMFA() {
  const phoneNumber = document.getElementById('phone').value;
  
  try {
    showMessage('发送验证码中...');
    const user = auth.currentUser;
    const session = await user.multiFactor.getSession();
    
    const provider = new firebase.auth.PhoneAuthProvider();
    currentVerificationId = await provider.verifyPhoneNumber({
      phoneNumber,
      session
    }, recaptchaVerifier);
    
    switchStep('step-verify-mfa');
    showMessage('验证码已发送，请输入短信验证码');
  } catch (error) {
    handleAuthError(error);
  }
}

// MFA 验证流程：用于注册和登录两种情况
async function verifySMSCode() {
  const code = document.getElementById('sms-code').value;
  
  try {
    showMessage('verify sms code  ing...');
    const credential = firebase.auth.PhoneAuthProvider.credential(
      // 如果 window.mfaVerificationId 存在，则说明这是 MFA 登录流程，否则为注册流程
      window.mfaVerificationId || currentVerificationId,
      code
    );
    const assertion = firebase.auth.PhoneMultiFactorGenerator.assertion(credential);
    
    if (window.mfaResolver) {
      // MFA 登录流程：使用 resolver 完成多因素登录
      await window.mfaResolver.resolveSignIn(assertion);
      // 清理全局变量
      window.mfaResolver = null;
      window.mfaVerificationId = null;
      showMessage('verify sms success....');
      alert('login---ok---')
  
    } else {
      // MFA 注册流程：为当前用户注册第二因素
      await auth.currentUser.multiFactor.enroll(assertion);
      showMessage('bling phone ok!');
      await completeLogin();
    }
  } catch (error) {
    handleAuthError(error);
  }
}

// 开始 MFA 登录验证流程（用于已注册 MFA 用户）
// 此函数接收从 catch(error) 中传递过来的 resolver 对象
async function startMFAVerification(resolver) {
  try {
    // 选择第一个已注册的第二因素（例如电话）
    const hint = resolver.hints[0];
    showMessage('mfa send sms code to phone: ' + hint.phoneNumber);
    
    const phoneAuthProvider = new firebase.auth.PhoneAuthProvider();
    // 使用 resolver 中的 session 进行验证码发送
    const verificationId = await phoneAuthProvider.verifyPhoneNumber({
      multiFactorHint: hint,
      session: resolver.session
    }, recaptchaVerifier);
    
    // 保存 resolver 和验证码ID，后续在 verifySMSCode 中使用
    window.mfaResolver = resolver;
    window.mfaVerificationId = verificationId;
    
    // 切换到验证码输入界面
    switchStep('step-verify-mfa');
    showMessage('print sms code....');
  } catch (error) {
    handleAuthError(error);
  }
}

async function completeLogin() {
  const user = auth.currentUser;
  if (user.emailVerified && user.multiFactor.enrolledFactors.length > 0) {
    showMessage('login...completion...');
    // 在此处可跳转到主界面
  }
}

function switchStep(stepId) {
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function showMessage(msg) {
  document.getElementById('message').textContent = msg;
}

function handleAuthError(error) {
  console.error('Auth Error:', error);
  switch(error.code) {
    case 'auth/multi-factor-auth-required':
      showMessage('nend  sms  code verity');
      break;
    case 'auth/invalid-verification-code':
      showMessage('sms code error');
      break;
    default:
      showMessage(`error: ${error.message}`);
  }
}
</script>
</body>
</html>


async function resendSmsCode(isMfaRegistration, phoneNumberOrHint, sessionOrResolverSession, recaptchaVerifier) {
  try {
    const provider = new firebase.auth.PhoneAuthProvider();
    let verificationId;
    if (isMfaRegistration) {
      // MFA 注册场景：传入 phoneNumber 和 session
      verificationId = await provider.verifyPhoneNumber({ phoneNumber: phoneNumberOrHint, session: sessionOrResolverSession }, recaptchaVerifier);
    } else {
      // MFA 登录场景：传入 multiFactorHint 和 session（来自 resolver）
      verificationId = await provider.verifyPhoneNumber({ multiFactorHint: phoneNumberOrHint, session: sessionOrResolverSession }, recaptchaVerifier);
    }
    console.log("新验证码已发送，verificationId:", verificationId);
    return verificationId;
  } catch (error) {
    console.error("重新发送验证码失败：", error);
    throw error;
  }
}

package zip.estrogen.mail.data.pgp

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

object BiometricGate {

    private const val AUTHENTICATORS =
        Authenticators.BIOMETRIC_WEAK or Authenticators.DEVICE_CREDENTIAL

    fun available(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(AUTHENTICATORS) ==
            BiometricManager.BIOMETRIC_SUCCESS

    fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        onResult: (Boolean) -> Unit
    ) {
        if (!available(activity)) {
            onResult(true)
            return
        }
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onResult(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onResult(false)
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build()
        prompt.authenticate(info)
    }
}

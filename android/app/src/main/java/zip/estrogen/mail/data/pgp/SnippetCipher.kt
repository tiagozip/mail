package zip.estrogen.mail.data.pgp

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object SnippetCipher {

    private const val KEY_ALIAS = "estrogen_snippet_key"
    private const val KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORM = "AES/GCM/NoPadding"
    private const val IV_LEN = 12
    private const val TAG_BITS = 128

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    fun encrypt(plain: String?): String? {
        if (plain.isNullOrEmpty()) return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val iv = cipher.iv
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            val combined = ByteArray(iv.size + ct.size)
            System.arraycopy(iv, 0, combined, 0, iv.size)
            System.arraycopy(ct, 0, combined, iv.size, ct.size)
            Base64.encodeToString(combined, Base64.NO_WRAP)
        }.getOrNull()
    }

    fun decrypt(blob: String?): String? {
        if (blob.isNullOrEmpty()) return null
        return runCatching {
            val combined = Base64.decode(blob, Base64.NO_WRAP)
            if (combined.size <= IV_LEN) return null
            val iv = combined.copyOfRange(0, IV_LEN)
            val ct = combined.copyOfRange(IV_LEN, combined.size)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        }.getOrNull()
    }
}

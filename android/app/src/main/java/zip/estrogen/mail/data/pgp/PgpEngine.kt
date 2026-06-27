package zip.estrogen.mail.data.pgp

import org.bouncycastle.openpgp.PGPPublicKeyRing
import org.bouncycastle.openpgp.PGPSecretKeyRing
import org.pgpainless.PGPainless
import org.pgpainless.decryption_verification.ConsumerOptions
import org.pgpainless.encryption_signing.EncryptionOptions
import org.pgpainless.encryption_signing.ProducerOptions
import org.pgpainless.key.protection.SecretKeyRingProtector
import org.pgpainless.key.protection.UnlockSecretKey
import org.pgpainless.util.Passphrase
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

data class UnlockedIdentity(
    val secretKeys: PGPSecretKeyRing,
    val protector: SecretKeyRingProtector,
    val armoredPublicKey: String
)

object PgpEngine {

    fun looksEncrypted(text: String?): Boolean {
        val t = text?.trimStart() ?: return false
        return t.startsWith("-----BEGIN PGP MESSAGE-----")
    }

    fun unlock(armoredPrivateKey: String, passphrase: String): Result<UnlockedIdentity> = runCatching {
        val secretKeys = PGPainless.readKeyRing().secretKeyRing(armoredPrivateKey)
            ?: throw IllegalArgumentException("Not a valid private key")
        val pass = Passphrase.fromPassword(passphrase)
        val protector = SecretKeyRingProtector.unlockAnyKeyWith(pass)
        val iterator = secretKeys.secretKeys
        while (iterator.hasNext()) {
            UnlockSecretKey.unlockSecretKey(iterator.next(), protector)
        }
        val armoredPublic = PGPainless.asciiArmor(PGPainless.extractCertificate(secretKeys))
        UnlockedIdentity(secretKeys, protector, armoredPublic)
    }

    fun decrypt(identity: UnlockedIdentity, armoredMessage: String): Result<String> = runCatching {
        val input = ByteArrayInputStream(armoredMessage.toByteArray(StandardCharsets.UTF_8))
        val options = ConsumerOptions()
            .addDecryptionKey(identity.secretKeys, identity.protector)
        val decryptionStream = PGPainless.decryptAndOrVerify()
            .onInputStream(input)
            .withOptions(options)
        val out = ByteArrayOutputStream()
        decryptionStream.use { stream -> stream.copyTo(out) }
        out.toString(StandardCharsets.UTF_8.name())
    }

    fun encrypt(armoredRecipientKeys: List<String>, plaintext: String): Result<String> = runCatching {
        val rings = armoredRecipientKeys.mapNotNull { armored ->
            runCatching { PGPainless.readKeyRing().publicKeyRing(armored) }.getOrNull()
        }
        require(rings.isNotEmpty()) { "No usable recipient keys" }

        val encryptionOptions = EncryptionOptions.encryptCommunications()
        rings.forEach { ring: PGPPublicKeyRing -> encryptionOptions.addRecipient(ring) }

        val out = ByteArrayOutputStream()
        val encryptionStream = PGPainless.encryptAndOrSign()
            .onOutputStream(out)
            .withOptions(ProducerOptions.encrypt(encryptionOptions).setAsciiArmor(true))
        encryptionStream.use { stream ->
            stream.write(plaintext.toByteArray(StandardCharsets.UTF_8))
        }
        out.toString(StandardCharsets.UTF_8.name())
    }

    fun publicKeyFromPrivate(armoredPrivateKey: String): Result<String> = runCatching {
        val secretKeys = PGPainless.readKeyRing().secretKeyRing(armoredPrivateKey)
            ?: throw IllegalArgumentException("Not a valid private key")
        PGPainless.asciiArmor(PGPainless.extractCertificate(secretKeys))
    }
}

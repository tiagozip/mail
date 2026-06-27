package zip.estrogen.mail

import android.app.Application
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SecureStore
import zip.estrogen.mail.data.SettingsStore
import zip.estrogen.mail.data.pgp.PgpManager
import zip.estrogen.mail.util.CrashReporter

class MailApp : Application() {

    lateinit var settings: SettingsStore
        private set

    lateinit var secureStore: SecureStore
        private set

    lateinit var pgp: PgpManager
        private set

    lateinit var repository: MailRepository
        private set

    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
        settings = SettingsStore(this)
        secureStore = SecureStore(this)
        pgp = PgpManager(secureStore)
        repository = MailRepository(settings, pgp)
    }
}

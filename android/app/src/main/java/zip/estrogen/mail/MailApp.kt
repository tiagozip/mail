package zip.estrogen.mail

import android.app.Application
import zip.estrogen.mail.data.MailRepository
import zip.estrogen.mail.data.SettingsStore

class MailApp : Application() {

    lateinit var settings: SettingsStore
        private set

    lateinit var repository: MailRepository
        private set

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(this)
        repository = MailRepository(settings)
    }
}

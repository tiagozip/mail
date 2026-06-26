-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class zip.estrogen.mail.**$$serializer { *; }
-keepclassmembers class zip.estrogen.mail.** {
    *** Companion;
}
-keepclasseswithmembers class zip.estrogen.mail.** {
    kotlinx.serialization.KSerializer serializer(...);
}

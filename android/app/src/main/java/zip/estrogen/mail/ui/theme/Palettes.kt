package zip.estrogen.mail.ui.theme

import androidx.compose.ui.graphics.Color
import com.materialkolor.PaletteStyle

enum class AppPalette(
    val key: String,
    val label: String,
    val seed: Color,
    val style: PaletteStyle
) {
    PLUM("plum", "Plum", Color(0xFFBF3264), PaletteStyle.TonalSpot),
    SAKURA("sakura", "Sakura", Color(0xFFE5739D), PaletteStyle.Expressive),
    MIDNIGHT("midnight", "Midnight", Color(0xFF6479F0), PaletteStyle.Vibrant),
    FOREST("forest", "Forest", Color(0xFF4C8C5A), PaletteStyle.TonalSpot),
    MOCHA("mocha", "Mocha", Color(0xFFA9714F), PaletteStyle.TonalSpot),
    LATTE("latte", "Latte", Color(0xFFB08968), PaletteStyle.Neutral),
    NORD("nord", "Nord", Color(0xFF5E81AC), PaletteStyle.Fidelity);

    companion object {
        fun fromKey(key: String?): AppPalette = entries.firstOrNull { it.key == key } ?: PLUM
    }
}

enum class DarkMode(val key: String, val label: String) {
    SYSTEM("system", "System"),
    LIGHT("light", "Light"),
    DARK("dark", "Dark");

    companion object {
        fun fromKey(key: String?): DarkMode = entries.firstOrNull { it.key == key } ?: SYSTEM
    }
}

package zip.estrogen.mail.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val PlumDarkColors = darkColorScheme(
    primary = RosePrimary,
    onPrimary = WarmTextStrong,
    primaryContainer = RoseContainerDark,
    onPrimaryContainer = RoseLight,
    secondary = RoseLight,
    onSecondary = PlumBackground,
    background = PlumBackground,
    onBackground = WarmTextDefault,
    surface = PlumSurface,
    onSurface = WarmTextDefault,
    surfaceVariant = PlumSurfaceVariant,
    onSurfaceVariant = WarmTextSubtle,
    outline = PlumOutline,
    error = Color_ErrorDark,
    onError = WarmTextStrong,
)

private val PlumLightColors = lightColorScheme(
    primary = RosePrimary,
    onPrimary = WarmTextStrong,
    primaryContainer = RoseContainerLight,
    onPrimaryContainer = RoseContainerDark,
    secondary = RosePrimary,
    onSecondary = LightSurface,
    background = LightBackground,
    onBackground = LightTextDefault,
    surface = LightSurface,
    onSurface = LightTextDefault,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightTextSubtle,
    outline = LightOutline,
)

@Composable
fun EstrogenMailTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> PlumDarkColors
        else -> PlumLightColors
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content
    )
}

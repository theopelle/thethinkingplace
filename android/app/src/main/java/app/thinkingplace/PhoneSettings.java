package app.thinkingplace;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Opens this app's notification settings, so a reader who once said "Don't allow" can turn
// reminders back on (Android never asks twice). Falls back to the app's info page, which
// every phone brand has, wherever its menus put things.
@CapacitorPlugin(name = "PhoneSettings")
public class PhoneSettings extends Plugin {

    @PluginMethod
    public void openNotifications(PluginCall call) {
        String pkg = getContext().getPackageName();
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) throw new IllegalStateException();
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
        } catch (Exception e) {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
        }
        call.resolve();
    }
}

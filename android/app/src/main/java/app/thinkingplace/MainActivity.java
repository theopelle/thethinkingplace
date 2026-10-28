package app.thinkingplace;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneSettings.class);  // our own: opens the app's notification settings
        super.onCreate(savedInstanceState);
    }
}

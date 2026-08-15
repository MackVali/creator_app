import Capacitor

class CreatorBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()

        if bridge?.plugin(withName: "CreatorWidget") == nil {
            bridge?.registerPluginInstance(CreatorWidgetPlugin())
            NSLog("[CREATOR_WIDGET_SYNC] native_plugin_registered_explicitly")
        }

        if bridge?.plugin(withName: "FocusGate") == nil {
            bridge?.registerPluginInstance(FocusGatePlugin())
            NSLog("[CREATOR_FOCUS_GATE] native_plugin_registered_explicitly")
        }
    }
}

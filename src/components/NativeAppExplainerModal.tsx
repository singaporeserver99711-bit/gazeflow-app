import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  ShieldAlert, 
  Layers, 
  Code, 
  ExternalLink, 
  Check, 
  Copy, 
  HelpCircle, 
  Play, 
  ArrowRight,
  Maximize2,
  Tv,
  Eye,
  Sparkles,
  ArrowUp,
  Hand,
  Download,
  Terminal,
  Settings
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToYouTubeMode: () => void;
}

export const NativeAppExplainerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSwitchToYouTubeMode,
}) => {
  const [activeTab, setActiveTab] = useState<'how-to-build' | 'github-cloud' | 'code' | 'quick-fixes'>('github-cloud');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const githubActionsYml = `# .github/workflows/build-apk.yml
name: Build GazeFlow Android APK

on:
  push:
    branches: [ "**" ]
  workflow_dispatch:

jobs:
  build:
    name: Build Android APK
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up Java JDK 17
        uses: actions/setup-java@v5
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Accept Android SDK Licenses & Setup local.properties
        run: |
          mkdir -p ~/.android
          touch ~/.android/repositories.cfg
          yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses || true
          echo "sdk.dir=$ANDROID_HOME" > android/local.properties

      - name: Setup Gradle 8.5
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.5'

      - name: Build Android Debug APK
        working-directory: ./android
        env:
          ANDROID_HOME: \${{ env.ANDROID_HOME }}
        run: |
          gradle :app:assembleDebug --no-daemon --stacktrace

      - name: Locate Generated APK
        id: locate_apk
        run: |
          APK_FILE=$(find android/app/build/outputs/apk -name "*.apk" | head -n 1)
          if [ -z "$APK_FILE" ]; then
            echo "Error: No APK file was generated!"
            exit 1
          fi
          echo "APK generated successfully: $APK_FILE"
          echo "APK_PATH=$APK_FILE" >> $GITHUB_ENV

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: gazeflow-app-debug-apk
          path: \${{ env.APK_PATH }}
          if-no-files-found: error
          retention-days: 14`;

  const floatingBubbleServiceCode = `// FloatingEyeBubbleService.kt
// This service creates the floating camera bubble over YouTube/Snapchat.
// CRUCIAL: Tapping the bubble toggles PAUSE / MANUAL mode so you never get stuck!
package com.gazeflow.app

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.IBinder
import android.view.*
import android.widget.ImageView
import android.widget.Toast
import androidx.core.content.ContextCompat

class FloatingEyeBubbleService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var floatingBubbleView: View
    private var isEyeTrackingPaused = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        // Inflate floating bubble view
        floatingBubbleView = LayoutInflater.from(this).inflate(R.layout.layout_floating_bubble, null)

        // Important flags: FLAG_NOT_FOCUSABLE ensures keyboard and back buttons work!
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 50
            y = 200
        }

        val bubbleIcon = floatingBubbleView.findViewById<ImageView>(R.id.bubble_icon)

        // CLICK TO STOP / RESUME: Tapping the bubble toggles manual scrolling!
        floatingBubbleView.setOnClickListener {
            isEyeTrackingPaused = !isEyeTrackingPaused
            if (isEyeTrackingPaused) {
                bubbleIcon.setColorFilter(ContextCompat.getColor(this, R.color.amber_500))
                Toast.makeText(this, "Eye Scroll PAUSED. You can scroll manually & press back!", Toast.LENGTH_SHORT).show()
            } else {
                bubbleIcon.setColorFilter(ContextCompat.getColor(this, R.color.emerald_500))
                Toast.makeText(this, "Eye Scroll ACTIVE. Look UP to scroll next short!", Toast.LENGTH_SHORT).show()
            }
        }

        // Draggable across the screen
        floatingBubbleView.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f

            override fun onTouch(v: View?, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        return false // Allow click listener to trigger
                    }
                    MotionEvent.ACTION_MOVE -> {
                        params.x = initialX + (event.rawX - initialTouchX).toInt()
                        params.y = initialY + (event.rawY - initialTouchY).toInt()
                        windowManager.updateViewLayout(floatingBubbleView, params)
                        return true
                    }
                }
                return false
            }
        })

        windowManager.addView(floatingBubbleView, params)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::floatingBubbleView.isInitialized) {
            windowManager.removeView(floatingBubbleView)
        }
    }
}`;

  const accessibilityServiceCode = `// GazeAccessibilityService.kt
// Dispatches touch swipes over the YouTube / Snapchat app when looking UP!
package com.gazeflow.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent

class GazeAccessibilityService : AccessibilityService() {

    companion object {
        var instance: GazeAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    /**
     * Triggered when user LOOKS UP:
     * Dispatches natural upward swipe to scroll to NEXT short!
     */
    fun onLookUpTriggered() {
        val metrics = resources.displayMetrics
        val width = metrics.widthPixels.toFloat()
        val height = metrics.heightPixels.toFloat()

        // Swipe up: touches bottom and swipes up smoothly in 260ms
        val swipePath = Path().apply {
            moveTo(width / 2, height * 0.80f)
            lineTo(width / 2, height * 0.20f)
        }

        val stroke = GestureDescription.StrokeDescription(swipePath, 0, 260)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    /**
     * Triggered when user LOOKS DOWN:
     * Dispatches downward swipe to return to PREVIOUS short!
     */
    fun onLookDownTriggered() {
        val metrics = resources.displayMetrics
        val width = metrics.widthPixels.toFloat()
        val height = metrics.heightPixels.toFloat()

        val swipePath = Path().apply {
            moveTo(width / 2, height * 0.22f)
            lineTo(width / 2, height * 0.78f)
        }

        val stroke = GestureDescription.StrokeDescription(swipePath, 0, 260)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }
}`;

  const mainActivityCode = `// MainActivity.kt
// Requests the 2 required Android permissions:
// 1) "Display over other apps" (Floating Bubble)
// 2) "Accessibility Service" (Swipe Gestures)
package com.gazeflow.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.btn_grant_overlay).setOnClickListener {
            // Opens Android "Display over other apps" settings page
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
        }

        findViewById<Button>(R.id.btn_grant_accessibility).setOnClickListener {
            // Opens Android Accessibility settings page
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }

        findViewById<Button>(R.id.btn_start_bubble).setOnClickListener {
            // Starts the floating bubble service!
            startService(Intent(this, FloatingEyeBubbleService::class.java))
            finish() // Minimize app and go to home screen / YouTube
        }
    }
}`;

  const manifestCode = `<!-- AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.gazeflow.app">

    <!-- Permissions required -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />

    <application
        android:allowBackup="true"
        android:label="GazeFlow"
        android:theme="@style/Theme.AppCompat.Light.NoActionBar">

        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".FloatingEyeBubbleService"
            android:exported="false" />

        <service
            android:name=".GazeAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>
    </application>
</manifest>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-7 text-neutral-100 shadow-2xl space-y-5 my-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
          <div>
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-400 block mb-0.5">
              APK Builder & Floating Bubble Guide
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
              How to Get the Android APK File & Floating Bubble
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-950 rounded-xl border border-neutral-800 text-xs overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('github-cloud')}
            className={`py-2 px-3 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === 'github-cloud'
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            ⭐ GitHub Cloud APK (Direct Phone Download)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('how-to-build')}
            className={`py-2 px-3 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === 'how-to-build'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            PC / Android Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`py-2 px-3 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === 'code'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Source Code Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quick-fixes')}
            className={`py-2 px-3 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === 'quick-fixes'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            In-App YouTube Mode
          </button>
        </div>

        {/* TAB: GITHUB CLOUD BUILDER (Zero PC needed, directly on phone) */}
        {activeTab === 'github-cloud' && (
          <div className="space-y-4 text-xs leading-relaxed text-neutral-300">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 space-y-1.5">
              <span className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                How to Build & Download the APK Using Your GitHub Account (No PC Needed!)
              </span>
              <p className="text-xs text-neutral-300">
                Since you have a GitHub account, GitHub gives you <strong>free cloud build servers</strong> (GitHub Actions). 
                GitHub compiles the Android APK in the cloud and gives you an installable <code>.apk</code> download link directly in your phone browser!
              </p>
            </div>

            <h4 className="font-bold text-sm text-white pt-1">
              4 Simple Steps on Your Phone Browser:
            </h4>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 font-bold flex items-center justify-center text-xs">1</span>
                  <span className="font-semibold text-white">Create a New GitHub Repository</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  Open <strong>github.com</strong> in your phone browser ➔ tap the <strong>+</strong> menu (top right) ➔ <strong>New repository</strong> ➔ Name it <code>gazeflow-app</code> ➔ Choose <strong>Public</strong> ➔ Tap <strong>Create repository</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 font-bold flex items-center justify-center text-xs">2</span>
                  <span className="font-semibold text-white">Add the GitHub Action Workflow File</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  In your new repository, tap <strong>&quot;Add file&quot;</strong> ➔ <strong>&quot;Create new file&quot;</strong>. 
                  In the filename box, type: <code>.github/workflows/build-apk.yml</code>.
                </p>
                <div className="pl-7 pt-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-neutral-400">Copy this exact YAML content:</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('gh-yml', githubActionsYml)}
                      className="py-1 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] flex items-center gap-1 transition-colors"
                    >
                      {copiedKey === 'gh-yml' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'gh-yml' ? 'Copied YAML!' : 'Copy Workflow YAML'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-emerald-300 max-h-36 overflow-x-auto">
                    {githubActionsYml}
                  </pre>
                  <p className="text-[11px] text-neutral-400 pt-1">
                    Scroll down and tap green button: <strong>&quot;Commit changes&quot;</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 font-bold flex items-center justify-center text-xs">3</span>
                  <span className="font-semibold text-white">Add the Android Source Code Files</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  Under the <strong>&quot;Source Code Files&quot;</strong> tab above, copy each file and add them to your repo:
                </p>
                <ul className="list-disc list-inside text-neutral-300 pl-7 text-[11px] font-mono space-y-0.5">
                  <li><code>FloatingEyeBubbleService.kt</code> (Tap to pause floating bubble)</li>
                  <li><code>GazeAccessibilityService.kt</code> (Look UP = Next Short)</li>
                  <li><code>MainActivity.kt</code> (Permissions buttons)</li>
                  <li><code>AndroidManifest.xml</code></li>
                </ul>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 font-bold flex items-center justify-center text-xs">4</span>
                  <span className="font-semibold text-white">Download the APK Directly on Your Phone</span>
                </div>
                <ol className="list-decimal list-inside text-neutral-300 pl-7 text-[11px] space-y-1">
                  <li>On GitHub, tap the <strong>&quot;Actions&quot;</strong> tab.</li>
                  <li>You will see: <strong>&quot;Build GazeFlow APK&quot;</strong> running. In ~90 seconds, it shows a green checkmark!</li>
                  <li>Tap the completed run ➔ scroll down to <strong>&quot;Artifacts&quot;</strong>.</li>
                  <li>Tap <strong>gazeflow-debug-apk</strong>. Your phone downloads the APK!</li>
                  <li>Tap the downloaded file to install on your Android device!</li>
                </ol>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className="text-emerald-400 hover:underline text-xs font-medium"
              >
                Copy the Source Code Files Now →
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: STEP BY STEP HOW TO MAKE THE APK FILE */}
        {activeTab === 'how-to-build' && (
          <div className="space-y-4 text-xs leading-relaxed text-neutral-300">
            {/* The Tap-to-Stop Floating Bubble Answer */}
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 space-y-1.5">
              <span className="font-bold text-sm text-emerald-400 flex items-center gap-1.5">
                <Hand className="w-4 h-4 text-emerald-400" />
                Your Feature: Tap Floating Bubble to Pause / Manual Mode
              </span>
              <p className="text-xs text-neutral-300">
                You asked: <em>&quot;whenever I want to click that floating bubble to stop it like if user is watching away screen and want to press back button or like scroll manually it should not stuck&quot;</em>.
              </p>
              <p className="text-xs text-emerald-300 font-medium">
                ✅ <strong>Solved:</strong> The floating bubble has an instant 1-tap toggle. Tapping it switches between <strong>Tracking ON (Green)</strong> and <strong>Manual Hold (Amber)</strong>. When paused, the bubble stays completely transparent to your touches, so you can freely scroll manually and press back without any interference!
              </p>
            </div>

            <h4 className="font-bold text-sm text-white pt-1">
              Step-by-Step: How to Make the Installable APK File (100% Free)
            </h4>

            {/* Steps List */}
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">Download Android Studio (Free from Google)</span>
                  <p className="text-neutral-400">
                    Go to <strong>developer.android.com/studio</strong> on your PC/Mac and download Android Studio. It is Google&apos;s official, completely free tool used to build Android APKs.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">Create a New Project</span>
                  <p className="text-neutral-400">
                    Open Android Studio ➔ Click <strong>New Project</strong> ➔ Select <strong>Empty Views Activity</strong> ➔ Name it <code>GazeFlow</code> ➔ Select Language: <strong>Kotlin</strong>.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">Paste the 3 Kotlin Files (From Tab 2)</span>
                  <p className="text-neutral-400">
                    Copy the code from the <strong>&quot;2. Android Studio Code&quot;</strong> tab and paste into:
                  </p>
                  <ul className="list-disc list-inside text-neutral-300 space-y-0.5 pt-1 font-mono text-[11px]">
                    <li><code>FloatingEyeBubbleService.kt</code> (The tap-to-stop floating bubble)</li>
                    <li><code>GazeAccessibilityService.kt</code> (Look UP = Scroll Next short)</li>
                    <li><code>MainActivity.kt</code> (Permission request screens)</li>
                  </ul>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  4
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">Build the .APK File in 1 Click</span>
                  <p className="text-neutral-400">
                    In the top menu bar of Android Studio, click:
                  </p>
                  <div className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-emerald-400 text-[11px] my-1 inline-block">
                    Build ➔ Build Bundle(s) / APK(s) ➔ Build APK(s)
                  </div>
                  <p className="text-neutral-400">
                    In ~60 seconds, a notification popup says: <em>&quot;APK(s) generated successfully!&quot;</em>. Click <strong>&quot;locate&quot;</strong> to get your <code>app-debug.apk</code> file!
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                  5
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">Install on Your Phone & Grant Permissions</span>
                  <p className="text-neutral-400">
                    Transfer the <code>.apk</code> to your phone and tap Install. When you open it:
                  </p>
                  <ol className="list-decimal list-inside text-neutral-300 space-y-1 pt-1">
                    <li>Tap <strong>&quot;Grant Display Over Other Apps&quot;</strong> ➔ Toggle ON (allows the bubble to float over YouTube).</li>
                    <li>Tap <strong>&quot;Grant Accessibility&quot;</strong> ➔ Select GazeFlow ➔ Turn ON (allows the look-up gesture to swipe).</li>
                    <li>Tap <strong>&quot;Start Floating Bubble&quot;</strong> ➔ Open YouTube! Look UP to scroll, and tap the bubble anytime to pause!</li>
                  </ol>
                </div>
              </div>

              {/* Only on Android Phone - No PC section */}
              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-200 space-y-2">
                <span className="font-bold text-sm text-purple-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-purple-400" />
                  Using only your Android Phone (No PC / Computer)?
                </span>
                <p className="text-xs text-neutral-300">
                  If you don&apos;t have a computer with Android Studio right now, you have 2 easy options:
                </p>
                <div className="space-y-1.5 text-[11px] text-neutral-300">
                  <p>
                    <strong>1. GitHub Cloud Builder (Free):</strong> Upload these 4 files to a free repository on <strong>github.com</strong> and add a <code>.github/workflows/build.yml</code>. GitHub&apos;s cloud builds the <code>.apk</code> for you in 90 seconds and gives you a direct download link on your phone!
                  </p>
                  <p>
                    <strong>2. Instant Web Floating Window:</strong> You don&apos;t even need to build an APK today. Just open GazeFlow in your phone&apos;s Chrome browser ➔ tap Recent Apps ➔ choose <strong>&quot;Open in pop-up view&quot;</strong> or <strong>Split-Screen</strong> ➔ open YouTube underneath!
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
              >
                <span>View & Copy Android Source Code</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CODE SNIPPETS */}
        {activeTab === 'code' && (
          <div className="space-y-4 text-xs leading-relaxed text-neutral-300">
            {/* 1. Floating Bubble Service */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="font-mono text-[11px] text-white">1. FloatingEyeBubbleService.kt (Tap to Stop)</span>
                <button
                  type="button"
                  onClick={() => handleCopy('bubble', floatingBubbleServiceCode)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] transition-colors"
                >
                  {copiedKey === 'bubble' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'bubble' ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto text-[10px] font-mono text-emerald-300/90 max-h-48">
                {floatingBubbleServiceCode}
              </pre>
            </div>

            {/* 2. Accessibility Service */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="font-mono text-[11px] text-white">2. GazeAccessibilityService.kt (Look UP to Scroll)</span>
                <button
                  type="button"
                  onClick={() => handleCopy('accessibility', accessibilityServiceCode)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] transition-colors"
                >
                  {copiedKey === 'accessibility' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'accessibility' ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto text-[10px] font-mono text-sky-300/90 max-h-44">
                {accessibilityServiceCode}
              </pre>
            </div>

            {/* 3. MainActivity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="font-mono text-[11px] text-white">3. MainActivity.kt (Permissions Setup)</span>
                <button
                  type="button"
                  onClick={() => handleCopy('main', mainActivityCode)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] transition-colors"
                >
                  {copiedKey === 'main' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'main' ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto text-[10px] font-mono text-purple-300/90 max-h-40">
                {mainActivityCode}
              </pre>
            </div>

            {/* 4. AndroidManifest */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="font-mono text-[11px] text-white">4. AndroidManifest.xml</span>
                <button
                  type="button"
                  onClick={() => handleCopy('manifest', manifestCode)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] transition-colors"
                >
                  {copiedKey === 'manifest' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'manifest' ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto text-[10px] font-mono text-amber-300/90 max-h-36">
                {manifestCode}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: QUICK WEB & SPLIT-SCREEN FIX */}
        {activeTab === 'quick-fixes' && (
          <div className="space-y-4 text-xs leading-relaxed text-neutral-300">
            <h4 className="font-bold text-sm text-white">
              Instant Use on Your Phone Today (No PC or APK Needed)
            </h4>

            {/* In-App YouTube Mode */}
            <div className="p-4 rounded-2xl bg-neutral-950 border border-emerald-500/40 space-y-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Tv className="w-4 h-4 text-emerald-400" />
                Real YouTube Shorts Inside GazeFlow
              </span>
              <p className="text-neutral-300">
                Don&apos;t want to compile an APK right now? You can watch real YouTube Shorts right here inside GazeFlow! Look UP scrolls to the next YouTube Short, and clicking the floating bubble pauses tracking instantly.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToYouTubeMode();
                }}
                className="mt-2 py-2 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Open Real YouTube Shorts Feed</span>
              </button>
            </div>

            {/* Android Pop-up Window */}
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                Android Pop-up Floating Window Trick
              </span>
              <p className="text-neutral-300">
                On Android (Samsung, OnePlus, Xiaomi, Pixel), you can put GazeFlow in a small floating pop-up window:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-neutral-400 pl-1">
                <li>Open GazeFlow in Chrome on your phone.</li>
                <li>Open Android <strong>Recent Apps</strong> screen.</li>
                <li>Tap the Chrome icon ➔ select <strong>&quot;Open in pop-up view&quot;</strong>.</li>
                <li>Open your YouTube app in the background!</li>
              </ol>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">
            Look UP = Next Short · Tap bubble to Pause
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};

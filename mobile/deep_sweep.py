import subprocess
import os
import re

# Configuration
PROJECT_ROOT = "/home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/z100-printer/android/src/main/jniLibs"
SAFE_LIBS = {
    "libc.so", "libm.so", "libdl.so", "liblog.so", "libstdc++.so", "libz.so", 
    "libjnigraphics.so", "libEGL.so", "libGLESv1_CM.so", "libGLESv2.so", 
    "libOpenSLES.so", "libandroid.so", "libvulkan.so", "libnativewindow.so",
    "libmediandk.so", "libicuuc.so", "libicui18n.so"
}

def get_needed(jni_dir):
    needed = set()
    try:
        files = [f for f in os.listdir(jni_dir) if f.endswith('.so')]
        for f in files:
            path = os.path.join(jni_dir, f)
            # Use readelf directly to avoid grep issues
            out = subprocess.check_output(f"readelf -d {path}", shell=True).decode()
            needed.update(re.findall(r'\[(.*?)\]', out))
    except Exception as e:
        pass # Some files might be zero-length or corrupt during failed pulls
    return needed

def sweep(arch):
    jni_dir = os.path.join(PROJECT_ROOT, arch)
    print(f"\n--- RECURSIVE SWEEP: {arch} ---")
    
    while True:
        pulled_in_this_pass = 0
        bundled = set(os.listdir(jni_dir))
        needed = get_needed(jni_dir)
        
        missing = sorted(needed - bundled - SAFE_LIBS)
        if not missing:
            print(f"  ✓ {arch} is fully stable. (Total: {len(bundled)} libraries)")
            break
            
        print(f"  Found {len(missing)} missing dependencies. Starting pull pass...")
        for lib in missing:
            # Search in all 3 possible remote partitions
            found = False
            for remote_base in ["/system/lib64", "/vendor/lib64", "/system/vendor/lib64", "/system/lib", "/vendor/lib", "/system/vendor/lib"]:
                # Check for correct bitness
                if ("64" in arch and "64" not in remote_base) or ("64" not in arch and "64" in remote_base):
                    continue
                
                remote_path = f"{remote_base}/{lib}"
                try:
                    # Try to pull directly. adb pull returns non-zero if file doesn't exist
                    result = subprocess.run(f"adb pull {remote_path} {jni_dir}/{lib}", shell=True, capture_output=True)
                    if result.returncode == 0:
                        print(f"    ✓ {lib} pulled from {remote_base}")
                        pulled_in_this_pass += 1
                        found = True
                        break
                except Exception:
                    continue
            
            if not found:
                print(f"    ⚠ Warning: {lib} not found on terminal.")
        
        if pulled_in_this_pass == 0:
            print(f"  Final pass complete. No more libraries could be resolved.")
            break
        print(f"  Pass complete. Pulled {pulled_in_this_pass} new libraries. Refreshing dependency tree...")

if __name__ == "__main__":
    if not os.path.exists(PROJECT_ROOT):
        print(f"ERROR: {PROJECT_ROOT} not found.")
        exit(1)
    
    sweep("arm64-v8a")
    sweep("armeabi-v7a")
    print("\n--- MASTER SWEEP COMPLETE! ---")

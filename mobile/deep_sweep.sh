#!/bin/bash
# Z100 Native Deep Sweep Script
# Recursively pulls all missing .so dependencies from the device until the set is stable.

PROJECT_ROOT="/home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/z100-printer/android/src/main/jniLibs"
SAFE_LIBS=("libc.so" "libm.so" "libdl.so" "liblog.so" "libstdc++.so" "libz.so" "libjnigraphics.so" "libEGL.so" "libGLESv1_CM.so" "libGLESv2.so" "libOpenSLES.so" "libandroid.so" "libvulkan.so")

sweep_arch() {
    local ARCH=$1
    local LIB_DIR=$2
    local REMOTE_PATHS=("/system/$LIB_DIR" "/vendor/$LIB_DIR" "/system/vendor/$LIB_DIR")
    local JNI_DIR="$PROJECT_ROOT/$ARCH"
    
    echo "--- Sweeping $ARCH ---"
    
    while true; do
        MISSING_FOUND=false
        
        # 1. Get all NEEDED libs from current folder
        NEEDED_LIBS=$(readelf -d "$JNI_DIR"/*.so 2>/dev/null | grep "(NEEDED)" | sed -E 's/.*\[(.*)\].*/\1/' | sort -u)
        
        for LIB in $NEEDED_LIBS; do
            # Skip safe/standard libs
            [[ " ${SAFE_LIBS[@]} " =~ " ${LIB} " ]] && continue
            
            # Check if we already have it
            if [ ! -f "$JNI_DIR/$LIB" ]; then
                echo "  Missing: $LIB"
                # Search and pull
                PULLED=false
                for PATH in "${REMOTE_PATHS[@]}"; do
                    if adb pull "$PATH/$LIB" "$JNI_DIR/$LIB" 2>/dev/null; then
                        echo "    ✓ Pulled $LIB from $PATH"
                        PULLED=true
                        MISSING_FOUND=true
                        break
                    fi
                done
                
                if [ "$PULLED" = false ]; then
                    echo "    ✗ Could not find $LIB on device"
                fi
            fi
        done
        
        # If no new libs were pulled in this pass, we are stable
        if [ "$MISSING_FOUND" = false ]; then
            echo "  $ARCH is stable."
            break
        fi
        echo "  New libraries found. Restarting sweep for dependencies..."
    done
}

sweep_arch "arm64-v8a" "lib64"
sweep_arch "armeabi-v7a" "lib"

echo "--- Sweep Complete! ---"

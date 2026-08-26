#include <jni.h>

static JavaVM* g_vm = 0;

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    g_vm = vm;
    return JNI_VERSION_1_4;
}

JNIEXPORT JavaVM* getJavaVM() {
    return g_vm;
}

JNIEXPORT void _ZN7android45register_com_mediatek_custom_CustomPropertiesEP7_JNIEnv(void* env) {
}

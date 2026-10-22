if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/home/emmanuel/.gradle/caches/9.3.1/transforms/34c2969acf4708ba0c5fb66c6697febf/transformed/hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/libs/android.arm64-v8a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/emmanuel/.gradle/caches/9.3.1/transforms/34c2969acf4708ba0c5fb66c6697febf/transformed/hermes-android-250829098.0.17-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


if(NOT TARGET react-native-nitro-modules::NitroModules)
add_library(react-native-nitro-modules::NitroModules SHARED IMPORTED)
set_target_properties(react-native-nitro-modules::NitroModules PROPERTIES
    IMPORTED_LOCATION "/home/emmanuel/Documents/PROJECTS/fisczim/mobile/node_modules/react-native-nitro-modules/android/build/intermediates/cxx/Debug/3f3a3x6p/obj/arm64-v8a/libNitroModules.so"
    INTERFACE_INCLUDE_DIRECTORIES "/home/emmanuel/Documents/PROJECTS/fisczim/mobile/node_modules/react-native-nitro-modules/android/build/headers/nitromodules"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


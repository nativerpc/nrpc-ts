cmake_minimum_required(VERSION 3.15)
project(nrpc_ts VERSION 1.0.1)

###################
# Common settings #
###################
    string(ASCII 27 Esc)
    set(Reset "${Esc}[m")
    set(Yellow      "${Esc}[33m")
    message(STATUS "${Yellow}Common settings${Reset}")
    set(CMAKE_WARN_DEPRECATED OFF CACHE BOOL "" FORCE)
    set(Bold  "${Esc}[1m")
    set(Red         "${Esc}[31m")
    set(Green       "${Esc}[32m")
    set(Blue        "${Esc}[34m")
    set(Magenta     "${Esc}[35m")
    set(Cyan        "${Esc}[36m")
    set(White       "${Esc}[37m")
    cmake_policy(SET CMP0169 OLD)

######################
# Fetch dependencies #
######################
    message(STATUS "${Yellow}Fetch dependencies${Reset}")
    enable_language(CXX)
    enable_language(C)
    include(FetchContent)
    include(CMakePackageConfigHelpers)
    FetchContent_Declare(zeromq_js
        GIT_REPOSITORY "https://github.com/zeromq/zeromq.js.git"
        GIT_TAG "v6.3.0" 
        SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/staging_modules/zeromq_js"
        EXCLUDE_FROM_ALL
    )
    FetchContent_GetProperties(zeromq_js)
    if(NOT zeromq_js_POPULATED)
        FetchContent_Populate(zeromq_js)
    endif()

######################
# Patch dependencies #
######################
    message(STATUS "${Yellow}Patch dependencies${Reset}")
    # simpler npm install and cmake-ts configuration for windows
    #
    file(READ "staging_modules/zeromq_js/package.json" package_json)
    string(
        REPLACE
        "\"install\": \"node ./script/install.js\""
        "\"NRPC_TS_REMOVED__install\": \"node ./script/install.js\""
        package_json "${package_json}"
    )
    string(
        REPLACE
        "\"prepare\": \"pnpm run"
        "\"NRPC_TS_REMOVED__prepare\": \"pnpm run"
        package_json "${package_json}"
    )
    string(
        REPLACE
        "    \"nodeAPI\": \"node-addon-api\",\n    \"configurations\""
        "    \"nodeAPI\": \"node-addon-api\",\n    \"generatorToUse\": \"Visual Studio 17 2022\",\n    \"generatorBinary\": \"native\",\n    \"configurations\""
        package_json "${package_json}"
    )
    string(
        REPLACE
        "\"typedoc\": \"^0.27.6\","
        ""
        package_json "${package_json}"
    )
    file(WRITE "staging_modules/zeromq_js/package.json" "${package_json}")
    
    # run_vcpkg(VCPKG_URL ...) changes
    #
    file(READ "staging_modules/zeromq_js/CMakeLists.txt" cmakelists_txt)
    string(
        REPLACE
        "\"ee2d2a100103e0f3613c60655dcf15be7d5157b8\""
        "\"origin/master\""
        cmakelists_txt "${cmakelists_txt}"
    )
    
    # allow FetchContent_Populate() calls in new CMake
    #
    string(
        REPLACE
        "cmake_minimum_required(VERSION 3.16)\n\nmacro(set_option_from_env OPTION_NAME)"
        "cmake_minimum_required(VERSION 3.16)\ncmake_policy(SET CMP0169 OLD)\n\nmacro(set_option_from_env OPTION_NAME)"
        cmakelists_txt "${cmakelists_txt}"
    )
    file(WRITE "staging_modules/zeromq_js/CMakeLists.txt" "${cmakelists_txt}")
    
    # missing chrono dependency
    #
    file(READ "staging_modules/zeromq_js/src/module.h" module_h)
    string(
        REPLACE
        "#include <cstdio>\n#include <future>"
        "#include <cstdio>\n#include <chrono>\n#include <future>"
        module_h "${module_h}"
    )
    file(WRITE "staging_modules/zeromq_js/src/module.h" "${module_h}")
    
    # getPeerState() method in socket.h
    #
    file(READ "staging_modules/zeromq_js/src/socket.h" socket_h)
    if(NOT "${socket_h}" MATCHES "NRPC-TS")
        set(
            new_code "
                // NRPC-TS: getPeerState() method
                Napi::Value _GetPeerState(const Napi::CallbackInfo& info);
            "
        )
        string(
            REPLACE
            "friend class Proxy;\n"
            "friend class Proxy;\n\n${new_code}\n"
            socket_h "${socket_h}"
        )
    endif()
    file(WRITE "staging_modules/zeromq_js/src/socket.h" "${socket_h}")

    # getPeerState() method in socket.cc
    #
    file(READ "staging_modules/zeromq_js/src/socket.cc" socket_cc)
    if(NOT "${socket_cc}" MATCHES "NRPC-TS")
        set(
            new_code "
                // NRPC-TS: getPeerState() method
                InstanceMethod<&Socket::_GetPeerState>(\"getPeerState\"),
            "
        )
        string(
            REPLACE
            "InstanceMethod<&Socket::SetSockOpt<char*>>(\"setStringOption\"),\n"
            "InstanceMethod<&Socket::SetSockOpt<char*>>(\"setStringOption\"),\n\n${new_code}\n"
            socket_cc "${socket_cc}"
        )
        set(
            new_code "
                // NRPC-TS: getPeerState() method 
                Napi::Value Socket::_GetPeerState(const Napi::CallbackInfo& info) {
                    assert(info[0].IsBuffer());
                    auto buf = info[0].As<Napi::Object>();
                    auto length = buf.As<Napi::Buffer<char>>().Length();
                    auto* value = buf.As<Napi::Buffer<char>>().Data();
                    auto res = zmq_socket_get_peer_state(socket, value, length);
                    return Napi::Number::New(Env(), res);
                }
            "
        )
        string(
            REPLACE
            "}  // namespace zmq"
            "\n${new_code}\n\n}  // namespace zmq"
            socket_cc "${socket_cc}"
        )
        
    endif()
    file(WRITE "staging_modules/zeromq_js/src/socket.cc" "${socket_cc}")
    
    # getPeerState() method in index.ts
    #
    file(READ "staging_modules/zeromq_js/src/index.ts" index_ts)
    if(NOT "${index_ts}" MATCHES "NRPC-TS")
        set(
            new_code "
                // NRPC-TS: getPeerState() method
                getPeerState(signature: Buffer): number
            "
        )
        string(
            REPLACE
            "readonly threadSafe: boolean\n"
            "readonly threadSafe: boolean\n\n${new_code}\n"
            index_ts "${index_ts}"
        )
    endif()
    file(WRITE "staging_modules/zeromq_js/src/index.ts" "${index_ts}")
    
    

########################
# Install dependencies #
########################
    message(STATUS "${Yellow}Install dependencies${Reset}")
    execute_process(
        COMMAND cmd /c npm i
        WORKING_DIRECTORY  ${CMAKE_CURRENT_LIST_DIR}/staging_modules/zeromq_js
    )

######################
# Build dependency 1 #
######################
    message(STATUS "${Yellow}Build dependency 1${Reset}")
    execute_process(
        COMMAND cmd /c npm run build.js
        WORKING_DIRECTORY  ${CMAKE_CURRENT_LIST_DIR}/staging_modules/zeromq_js
    )

######################
# Build dependency 2 #
######################
    message(STATUS "${Yellow}Build dependency 2${Reset}")
    execute_process(
        COMMAND cmd /c npm run build.native
        WORKING_DIRECTORY  ${CMAKE_CURRENT_LIST_DIR}/staging_modules/zeromq_js
    )

######################
# Build dependency 3 #
######################
    message(STATUS "${Yellow}Build dependency 3${Reset}")
    execute_process(
        COMMAND cmd /c node node_modules/@aminya/cmake-ts/build/main.js nativeonly
        WORKING_DIRECTORY  ${CMAKE_CURRENT_LIST_DIR}/staging_modules/zeromq_js
    )

# ######################
# # Build dependency 3 #
# ######################
# message(STATUS "${Yellow}Build dependency 3${Reset}")
# execute_process(
#     COMMAND cmd /c npm i ./staging_modules/zeromq_js
#     WORKING_DIRECTORY  ${CMAKE_CURRENT_LIST_DIR}
# )

#####################
# Find dependencies #
#####################
    message(STATUS "${Yellow}Find dependencies${Reset}")
    find_package(ZeroMQ REQUIRED HINTS "staging_modules/zeromq_js/staging/win32/x64/node/127/vcpkg_installed/x64-windows-static/share/zeromq")
    get_directory_property(DepsTargets IMPORTED_TARGETS)
    message(STATUS "Deps: ${DepsTargets}")

#################
# Setup targets #
#################
    message(STATUS "${Yellow}Setup targets${Reset}")
    get_directory_property(FinalTargets BUILDSYSTEM_TARGETS)
    message(STATUS "Targets: none")


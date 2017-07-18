declare module Cordova {
    export module Plugin {
        
        type CordovaCallbackValue<T> = (data: T) => void
        type CordovaCallback = () => void
        type Dictionary<T> = { [key: string]: T }

        export type FacebookAuthState = {
            status: "connected" | "unknown"
            authResponse: {
                session_key: boolean
                accessToken: string
                expiresIn: number
                userID?: string
            }
        }

        export type DialogOptions =
            DialogShareOptionw |
            DialogSendOptions |
            DialogGameRequestOptions

        export type DialogShareOptionw = {
            method: "share"
            href: string
            caption?: string
            quote?: string
            description?: string
            picture?: string
            hashtag?: string
        }
        export type DialogSendOptions = {
            method: "send"
            link: string
            to?: string | string[]
            caption?: string
            description?: string
            picture?: string
            hashtag?: string
        }
        export type DialogGameRequestOptions = {
            method: "apprequests"
            message: string
            title?: string
            to?: string
            suggestions?: string[]
            exclude_ids?: string[]
            max_recipients?: number
            actionType?: "askfor" | "send" | "turn"
            object_id?: string
            filters?: "app_non_users" | "app_users" | { name: string, user_ids: string[] }[]
            data?: string
        }

        export type AppInviteOptions = {
            url: string
            picture: string
        }

        export interface FacebookConnect {
            login(permissions: string[], success?: CordovaCallbackValue<FacebookAuthState>, f?: CordovaCallbackValue<any>): void
            logout(s?: CordovaCallback, f?: CordovaCallback): void

            getAccessToken(s: CordovaCallbackValue<string>, f?: CordovaCallback): void
            getLoginStatus(s: CordovaCallbackValue<FacebookAuthState>, f?: CordovaCallback): void
            checkHasCorrectPermissions(permissions: string[], success: CordovaCallback, f: CordovaCallbackValue<any>): void

            api<T>(graphPath: string, method: "POST", body: {}, permissions: string[] | undefined | null, s: CordovaCallbackValue<T>, f?: CordovaCallback): void
            api<T>(graphPath: string, permissions: string[] | undefined | null, s: CordovaCallbackValue<T>, f?: CordovaCallback): void

            showDialog(options: DialogOptions, s?: CordovaCallbackValue<{}>, f?: CordovaCallbackValue<any>): void
            appInvite(options: AppInviteOptions, s?: CordovaCallbackValue<{}>, f?: CordovaCallbackValue<any>): void

            logEvent(name: string, params?: Dictionary<string | number>, valueToSum?: number, s?: CordovaCallback, f?: CordovaCallbackValue<any>): void
            logPurchase(value: number, currency: string, s?: CordovaCallback, f?: CordovaCallbackValue<any>): void
            activateApp(s?: CordovaCallback, f?: CordovaCallback): void

            getDeferredApplink(s: CordovaCallbackValue<string>, f?: CordovaCallback): void
        }
    }
}

interface Window {
    readonly facebookConnectPlugin: Cordova.Plugin.FacebookConnect
}

declare const facebookConnectPlugin: Cordova.Plugin.FacebookConnect
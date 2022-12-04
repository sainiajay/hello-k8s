import k8s, { V1Deployment } from '@kubernetes/client-node';
import yml from 'js-yaml';
import fs from 'fs'

const kc = new k8s.KubeConfig()
kc.loadFromDefault()

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
const k8sNetworkingApi = kc.makeApiClient(k8s.NetworkingV1Api)
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)

const NAMESPACE = 'default'
const catchFailure = response => {
    const code = response.response?.body?.code
    if(code === 409) {
        return;
    }
    console.error(response.response?.body || response)
}

function buildSecretForDb(name: string) {
    return {
        metadata: {
            name: `${name}-secret`
        },
        type: 'Opaque',
        data: {
            username: "YWRtaW4=",
            password: "MWYyZDFlMmU2N2Rm"
        }
    }
}

function buildConfigForDb(name: string) {
    return {
        metadata: {
            name: `${name}-config`
        },
        data: {
            endpoint: `mongodb-service`
        }
    }
}

function buildDeploymentForDb(name: string) {
    const dbDeploymentManifest = {
        metadata: {
            name: `${name}-deployment`,
            labels: {
                app: name
            }
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: {
                    app: name
                }
            },
            template: {
                metadata: {
                    labels: {
                        app: name
                    }
                },
                spec: {
                    containers: [{  
                        name: name,
                        image: "mongo:5.0.14",
                        ports: [{
                            containerPort: 27017
                        }],
                        env: [{
                            name: "MONGO_INITDB_ROOT_USERNAME",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "mongodb-secret",
                                    key: "username"
                                }
                            }
                        },
                        {
                            name: "MONGO_INITDB_ROOT_PASSWORD",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "mongodb-secret",
                                    key: "password"
                                }
                            }
                        }]
                    }]
                }
            }
        }
    }

    const dbServiceManifest = {
        metadata: {
            name: `${name}-service`
        },
        spec: {
            selector: {
                app: name
            },
            ports: [{
                protocol: 'TCP',
                port: 27017,
                targetPort: 27017
            }]
        }
    }

    return { dbDeploymentManifest, dbServiceManifest }
}

function buildDeploymentForApp(name: string) {
    const appDeploymentManifest = {
        metadata: {
            name: `${name}-deployment`,
            labels: {
                app: name
            }
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: {
                    app: name
                }
            },
            template: {
                metadata: {
                    labels: {
                        app: name
                    }
                },
                spec: {
                    containers: [{  
                        name: name,
                        image: "nanajanashia/k8s-demo-app:v1.0",
                        ports: [{
                            containerPort: 3000
                        }],
                        env: [{
                            name: "USER_NAME",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "mongodb-secret",
                                    key: "username"
                                }
                            }
                        },
                        {
                            name: "USER_PWD",
                            valueFrom: {
                                secretKeyRef: {
                                    name: "mongodb-secret",
                                    key: "password"
                                }
                            }
                        },
                        {
                            name: "DB_URL",
                            valueFrom: {
                                configMapKeyRef: {
                                    name: "mongodb-config",
                                    key: "endpoint"
                                }
                            }
                        }]
                    }]
                }
            }
        }
    }
    const appServiceManifest = {
        metadata: {
            name: `${name}-service`
        },
        spec: {
            selector: {
                app: name
            },
            ports: [{
                protocol: 'TCP',
                port: 3000,
                targetPort: 3000
            }]
        }
    }
    return { appDeploymentManifest, appServiceManifest }
}

async function provisionDb(name: string) {
    const secretManifest = buildSecretForDb(`${name}-secret`)
    const endpoint = buildConfigForDb(`${name}-config`)
    const mongodbDeployment = buildDeploymentForDb(name)

}

async function provisionApp() {
    try {
        const dbName = "mongodb"

        const secretManifest = buildSecretForDb(dbName)
        const secret = await k8sApi.createNamespacedSecret(NAMESPACE, secretManifest).catch(catchFailure)
        if(secret) {
            console.log('secret created!')
            console.log(secret.body)
        }

        const configManifest = buildConfigForDb(dbName)
        const config = await k8sApi.createNamespacedConfigMap(NAMESPACE, configManifest).catch(catchFailure)

        if(config) {
            console.log('config created!')
            console.log(config.body)
        }

        const { dbDeploymentManifest, dbServiceManifest } = buildDeploymentForDb(dbName)
        const dbDeployment = await k8sAppsApi.createNamespacedDeployment(NAMESPACE, dbDeploymentManifest).catch(catchFailure)
        const dbService = await k8sApi.createNamespacedService(NAMESPACE, dbServiceManifest).catch(catchFailure)

        const appName = "webapp"
        const { appDeploymentManifest, appServiceManifest } = buildDeploymentForApp(appName)
        const appDeployment = await k8sAppsApi.createNamespacedDeployment(NAMESPACE, appDeploymentManifest).catch(catchFailure)
        const appService = await k8sApi.createNamespacedService(NAMESPACE, appServiceManifest).catch(catchFailure)

        console.log('Done!')
    }
    catch(exception) {
        console.log('Something went wrong')
    }
}

provisionApp()
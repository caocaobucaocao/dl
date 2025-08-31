// 赋值为，一个函数，返回值为 Promise<string>,Resole:string 代表内部函数执行成功后的返回值，可以为函数类型
const fetchData = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const success = true;
            if (success) {
                // resolve 的值必须是 string 类型（符合 Promise<string> 的约束）
                resolve("异步操作成功，返回数据");
            } else {
                // reject 的值建议是 Error 类型（TS 不强制，但符合最佳实践）
                reject(new Error("异步操作失败"));
            }
        }, 1000);
    });
};
console.log('主线程执行')
fetchData().then(r => {
    console.log(r);
})

// 定义接口，约束异步返回的对象结构
interface UserData {
    id: number;
    username: string;
}

// Promise<UserData>：明确成功时返回 UserData 类型的对象
const fetchUser = (userId: number): Promise<UserData> => {
    return new Promise((resolve, reject) => {
        fetch(`http://127.0.0.1:8000/zhuye/user/${userId}`)
            .then((response) => {
                if (!response.ok) {
                    // 对于404、500等错误状态码，主动抛出错误，不然则是成功返回
                    throw new Error(`HTTP状态错误: ${response.status} (${response.statusText})`);
                }
                return response.json();
            })
            .then((data: UserData) => resolve(data)) // 数据必须符合 UserData 结构
            .catch((err) => {
                console.log("1" + err)
                reject(new Error(`获取用户失败：${err.message}`))
            });
    });
};
fetchUser(1).then(userData => {
    console.log(userData);
}).catch(err => {
    console.log("4" + err);
});
// 1. 定义一个返回 Promise<number> 的函数（计算异步加法）
const asyncAdd = (a: number, b: number): Promise<number> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(a + b), 500); // 成功：返回 number
    });
};
// 1. 定义 async 函数（返回值自动变为 Promise<void>）
const runAsyncTask = async () => {
    try {
        // await 等待 Promise 完成，直接获取 result（自动推断为 number 类型）
        const result1 = await asyncAdd(2, 3);
        console.log("第一步结果：", result1);

        // 链式异步操作：用 await 串联，逻辑更线性
        const finalResult = await asyncAdd(result1, 5);
        console.log("最终结果：", finalResult);
    } catch (err: unknown) {
        // 注意：err 默认是 unknown 类型（TS 3.0+ 严格模式），需手动缩小类型
        if (err instanceof Error) {
            console.error("错误：", err.message);
        } else {
            console.error("未知错误：", err);
        }
    } finally {
        console.log("异步流程结束");
    }
};

// 2. 调用 async 函数（返回 Promise，可继续用 then/catch）
runAsyncTask().then(r => {
});

// async 函数返回值会自动包装为 Promise<T>
// 这里返回 string 类型，函数整体返回 Promise<string>
const getAsyncMessage = async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return "异步消息"; // TS 自动包装为 Promise.resolve("异步消息")
};

const tt = async () => {
    // 调用时，await 直接获取 string 类型
    console.log('-----------')
    const message = await getAsyncMessage();
    console.log(message); // 类型：string
}
tt().then()

const fetchProduct = async (userId: number) => {
    return fetch(`http://127.0.0.1:8000/zhuye/user/${userId}`).then(res => res.json());
};

// 2. 并行执行，用 Promise.all 包装
const fetchAllData = async () => {
    try {
        // Promise.all 接收 Promise 数组，返回结果数组（类型自动推断）
        const [user, product] = await Promise.all([
            fetchUser(1), // 结果类型：UserData
            fetchProduct(2), // 结果类型：{ id: number; name: string; price: number }
        ]);

        // TS 自动推断 user 为 UserData 类型，product 为商品类型
        console.log("用户1：", user.username);
        console.log("用户2：", product.id, product.username);
    } catch (err: unknown) {
        console.error("任一请求失败：", (err as Error).message);
    }
};
fetchAllData().then()
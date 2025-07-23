type NatType = 'Full Cone' | 'Restricted Cone' | 'Port Restricted Cone' | 'Symmetric' | 'Unknown'

interface CandidateInfo {
  ip?: string // 公网IP（STUN返回的地址）
  port?: string // 公网端口（STUN返回的地址）
  serve_ip?: string // STUN服务器IP（作为外部目标IP）
  serve_port?: string // STUN服务器端口（作为外部目标端口）
}

/**
 * 判断NAT类型（严格基于NAT类型定义）
 * @param info_1 第一个STUN服务器返回的候选信息（包含公网映射和对应的外部目标）
 * @param info_2 第二个STUN服务器返回的候选信息（包含公网映射和对应的外部目标）
 * @returns NAT类型
 */
const judgeNatType = (info_1: CandidateInfo, info_2: CandidateInfo): NatType => {
  if (!info_1?.ip || !info_1?.port || !info_1?.serve_ip || !info_1?.serve_port || !info_2?.ip || !info_2?.port || !info_2?.serve_ip || !info_2?.serve_port) {
    return 'Unknown'
  }

  const [ip1, port1] = [info_1.ip, info_1.port]
  const [target1_ip, target1_port] = [info_1.serve_ip, info_1.serve_port]
  const [ip2, port2] = [info_2.ip, info_2.port]
  const [target2_ip, target2_port] = [info_2.serve_ip, info_2.serve_port]

  // ---------------------- 全锥型判断 ----------------------
  // 全锥型：公网映射与外部目标无关（两个目标的公网映射完全相同）
  if (ip1 === ip2 && port1 === port2) {
    return 'Full Cone'
  }

  // ---------------------- 受限锥型判断 ----------------------
  // 受限锥型：公网IP固定（与某一外部目标的IP一致），端口可能变化
  // 条件：公网IP与其中一个外部目标的IP一致，且另一个目标的公网IP可能不同（但此处仅两个目标）
  const isIpFixedWithTarget1 = ip1 === target1_ip && (ip2 !== target1_ip || port2 !== port1)
  const isIpFixedWithTarget2 = ip2 === target2_ip && (ip1 !== target2_ip || port1 !== port2)
  if (isIpFixedWithTarget1 || isIpFixedWithTarget2) {
    return 'Restricted Cone'
  }

  // ---------------------- 端口受限锥型判断 ----------------------
  // 端口受限锥型：公网IP和端口均固定（与某一外部目标的IP:端口一致）
  const isPortFixedWithTarget1 = ip1 === target1_ip && port1 === target1_port && (ip2 !== target1_ip || port2 !== target1_port)
  const isPortFixedWithTarget2 = ip2 === target2_ip && port2 === target2_port && (ip1 !== target2_ip || port1 !== target2_port)
  if (isPortFixedWithTarget1 || isPortFixedWithTarget2) {
    return 'Port Restricted Cone'
  }

  // ---------------------- 对称型判断 ----------------------
  // 对称型：公网映射随外部目标变化（IP或端口至少一个不同，且与目标相关）
  return 'Symmetric'
}

/**
 * 获取NAT类型（完整实现）
 * @returns { address: string; natType: NatType }
 */
export const getNatType = async (): Promise<{ address: string; natType: NatType }> => {
  const STUN_SERVER_1 = 'stun.cloudflare.com:3478'
  const STUN_SERVER_2 = 'stun.l.google.com:19302'

  const getCandidateInfo = async (url: string): Promise<CandidateInfo | null> => {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:${url}` }] })

      pc.createDataChannel('ice-channel') // 创建一个数据轨道 用于触发收集ice候选

      let candidateInfo: CandidateInfo | null = null

      // 监听ICE候选（仅收集第一个srflx候选）
      pc.onicecandidate = (e) => {
        if (e.candidate?.type === 'srflx') {
          // 解析STUN服务器地址（作为外部目标）
          const [serveIp, servePort] = url.split(':').map((p) => p.trim())
          candidateInfo = {
            ip: e.candidate.address || '',
            port: e.candidate.port?.toString(),
            serve_ip: serveIp,
            serve_port: servePort
          }
          pc.close() // 找到候选后立即关闭连接
          resolve(candidateInfo)
        }
      }

      // 超时处理（5秒）
      setTimeout(() => {
        pc.close()
        resolve(null)
      }, 5000)

      // 触发候选生成（创建offer并设置本地描述）
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => resolve(null))
    })
  }

  try {
    // 获取两个STUN服务器的候选信息（包含公网映射和对应的外部目标）
    const info1 = await getCandidateInfo(STUN_SERVER_1)
    const info2 = await getCandidateInfo(STUN_SERVER_2)

    if (!info1 || !info2) {
      return { address: '', natType: 'Unknown' }
    }

    // 判断NAT类型（基于公网映射与外部目标的关系）
    const natType = judgeNatType(info1, info2)

    return { address: info1.ip || '', natType }
  } catch (err) {
    console.error('获取NAT类型失败:', err)
    return { address: '', natType: 'Unknown' }
  }
}

// 判断逻辑（覆盖全锥型、IP受限锥型、端口受限锥型、对称型）
const judgeNatType = (candidates_1: RTCIceCandidate[], candidates_2: RTCIceCandidate[]) => {
  const [candidate_1] = candidates_1
  const [candidate_2] = candidates_2

  // 默认 ​对称型（Symmetric）
  let natType: 'Full Cone' | 'Restricted Cone' | 'Port Restricted Cone' | 'Symmetric' = 'Symmetric'

  // 全锥型（Full Cone）​ 无论外部请求的目标IP/端口如何，NAT始终映射到固定的公网地址（IP和端口均不变）
  if (candidate_1.address === candidate_2.address && candidate_1.port === candidate_2.port) {
    natType = 'Full Cone'
  }

  // 受限锥型（Restricted Cone）​ 仅允许曾向该外部IP发起过请求的客户端通过，但端口不限（IP固定，端口可能变化）。
  if (candidate_1.address === candidate_2.address && candidate_1.port !== candidate_2.port) {
    natType = 'Restricted Cone'
  }

  // 端口受限锥型（Port-Restricted Cone）​ 仅允许曾向特定（IP, 端口）对发起过请求的客户端通过（IP固定，端口严格匹配）。
  if (candidate_1.address === candidate_2.address && candidate_1.port !== candidate_2.port) {
    natType = 'Port Restricted Cone'
  }

  // ​​对称型（Symmetric）​ 每次向不同外部目标发送请求时，NAT会分配新的公网端口（IP可能变化）。

  return natType
}

/**
 * 获取NAT类型
 * @returns 'Full Cone' | 'Restricted Cone' | 'Port Restricted Cone' | 'Symmetric'
 */
export const getNatType = async () => {
  const STUN_SERVER = 'stun.cloudflare.com:3478'

  const getCandidates = async () => {
    return new Promise<RTCIceCandidate[]>(async (resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:${STUN_SERVER}` }] })

      pc.createDataChannel('invitation-channel') // 创建一个数据轨道 用于触发收集ice候选

      // 收集ICE候选
      const srflxCandidates: RTCIceCandidate[] = []

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          // 过滤出STUN获取的公网候选（类型为'srflx'）
          if (e.candidate.type === 'srflx') {
            srflxCandidates.push(e.candidate)
          }
        } else {
          // 候选收集完成，开始分析
          if (srflxCandidates.length === 0) {
            console.log('\x1b[38;2;0;151;255m%c%s\x1b[0m', 'color:#0097ff;', `------->Breathe: 未获取到STUN候选，请检查STUN服务器是否可达`)
            return
          }
          resolve(srflxCandidates)
        }
      }

      // 触发候选收集（创建空offer）
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
      } catch (err) {
        console.log('\x1b[38;2;0;151;255m%c%s\x1b[0m', 'color:#0097ff;', `------->Breathe: 未获取到STUN候选，请检查STUN服务器是否可达`)
      }
    })
  }

  const candidates = await Promise.all([getCandidates(), getCandidates()])
  const natType = judgeNatType(...candidates)
  const [candidate] = candidates[0]
  const { address } = candidate
  return { address, natType }
}

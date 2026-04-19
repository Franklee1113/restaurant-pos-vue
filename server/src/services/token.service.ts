import crypto from 'node:crypto'

/**
 * Token 生成与验证服务
 */
export class TokenService {
  /**
   * 生成加密安全的随机令牌
   * 32字节 = 64字符十六进制，或 43字符 Base64URL
   */
  static generate(): string {
    return crypto.randomBytes(32).toString('base64url')
  }

  /**
   * 生成较短的订单查询码（用于人类可读场景）
   * 8位数字字母组合
   */
  static generateShortCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase()
  }
}

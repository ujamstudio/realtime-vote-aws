variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "env" {
  type    = string
  default = "prod"
}

variable "project" {
  type    = string
  default = "mtvote"
}

variable "lambda_dist_dir" {
  description = "Path to backend/dist (output of backend/build.sh)"
  type        = string
  default     = "../../backend/dist"
}

variable "admin_password" {
  description = "Token required by /admin/* endpoints (sent via x-admin-token header). Override via tfvars or TF_VAR_admin_password."
  type        = string
  sensitive   = true
  default     = "mtvote2026"
}

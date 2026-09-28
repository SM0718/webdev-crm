import mongoose from 'mongoose';

import { USERNAME_MAX, USERNAME_MESSAGE, USERNAME_MIN, USERNAME_PATTERN } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`],
      maxlength: [USERNAME_MAX, `Username cannot exceed ${USERNAME_MAX} characters`],
      match: [USERNAME_PATTERN, USERNAME_MESSAGE],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'member'],
        message: 'Role must be either admin or member',
      },
      default: 'member',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    username: this.username,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
export default User;

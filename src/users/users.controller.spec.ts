import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

describe('UsersController (Self endpoints)', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const mockUsersService = {
      getMe: jest.fn(),
      updateMe: jest.fn(),
      changePassword: jest.fn(),
      deleteMe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMe', () => {
    it('should call usersService.getMe with correct userId', async () => {
      const userId = 'user-123';
      const expectedUser = { id: userId, email: 'test@example.com' };
      usersService.getMe.mockResolvedValue(expectedUser as any);

      const result = await controller.getMe(userId);
      expect(usersService.getMe).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expectedUser);
    });
  });

  describe('updateMe', () => {
    it('should call usersService.updateMe with userId and dto', async () => {
      const userId = 'user-123';
      const dto: UpdateProfileDto = { name: 'New Name', phone: '1234567890' };
      const expectedUser = { id: userId, ...dto, email: 'test@example.com' };
      usersService.updateMe.mockResolvedValue(expectedUser as any);

      const result = await controller.updateMe(userId, dto);
      expect(usersService.updateMe).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expectedUser);
    });
  });

  describe('changePassword', () => {
    it('should call usersService.changePassword with userId and dto', async () => {
      const userId = 'user-123';
      const dto: ChangePasswordDto = { currentPassword: 'old', newPassword: 'new' };
      const expectedResult = { message: 'Password changed successfully. Please log in again.' };
      usersService.changePassword.mockResolvedValue(expectedResult);

      const result = await controller.changePassword(userId, dto);
      expect(usersService.changePassword).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteMe', () => {
    it('should call usersService.deleteMe with userId', async () => {
      const userId = 'user-123';
      const expectedResult = { message: 'Account deleted successfully.' };
      usersService.deleteMe.mockResolvedValue(expectedResult);

      const result = await controller.deleteMe(userId);
      expect(usersService.deleteMe).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expectedResult);
    });
  });
});

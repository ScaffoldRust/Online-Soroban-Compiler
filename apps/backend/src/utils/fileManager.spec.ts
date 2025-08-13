import { FileManager, type ProjectConfig } from './fileManager';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

// Mock fs and os modules
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    rm: jest.fn(),
    access: jest.fn(),
  },
}));
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockTmpdir = tmpdir as jest.MockedFunction<typeof tmpdir>;

describe('FileManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTmpdir.mockReturnValue('/tmp');

    // Reset static state
    (FileManager as unknown as { activeProjects: Set<string> }).activeProjects = new Set<string>();
  });

  describe('createProject', () => {
    it('should create a project with basic configuration', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
        projectName: 'test-project',
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const project = await FileManager.createProject(config);

      expect(project.projectPath).toMatch(/\/tmp\/test-project-\d+-[a-z0-9]+/);
      expect(project.sourcePath).toMatch(/\/tmp\/test-project-\d+-[a-z0-9]+\/src\/lib\.rs/);
      expect(project.cargoPath).toMatch(/\/tmp\/test-project-\d+-[a-z0-9]+\/Cargo\.toml/);
      expect(typeof project.cleanup).toBe('function');

      // Verify directory creation
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/test-project-\d+-[a-z0-9]+/),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/test-project-\d+-[a-z0-9]+\/src/),
        { recursive: true }
      );

      // Verify file writing
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/test-project-\d+-[a-z0-9]+\/Cargo\.toml/),
        expect.stringContaining('[package]'),
        'utf8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/test-project-\d+-[a-z0-9]+\/src\/lib\.rs/),
        'use soroban_sdk::*;',
        'utf8'
      );
    });

    it('should create project with custom dependencies', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
        dependencies: {
          'custom-crate': '1.0.0',
          'another-crate': '2.1.0',
        },
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await FileManager.createProject(config);

      // Check that Cargo.toml includes custom dependencies
      const cargoTomlCall = mockFs.writeFile.mock.calls.find((call) =>
        call[0].toString().endsWith('Cargo.toml')
      );

      expect(cargoTomlCall).toBeDefined();
      const cargoTomlContent = cargoTomlCall![1] as string;
      expect(cargoTomlContent).toContain('custom-crate = "1.0.0"');
      expect(cargoTomlContent).toContain('another-crate = "2.1.0"');
    });

    it('should sanitize project name', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
        projectName: 'my/dangerous\\project<name>',
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const project = await FileManager.createProject(config);

      // Verify the path doesn't contain dangerous characters in the project name part
      // The path will contain /tmp/ which is valid, but the project name should be sanitized
      expect(project.projectPath).not.toContain('\\');
      expect(project.projectPath).not.toContain('<');
      expect(project.projectPath).not.toContain('>');
      // Check that the project name part is sanitized (after the last /)
      const projectNamePart = project.projectPath.split('/').pop() || '';
      expect(projectNamePart).not.toContain('/');
      expect(projectNamePart).not.toContain('\\');
      expect(projectNamePart).not.toContain('<');
      expect(projectNamePart).not.toContain('>');
    });

    it('should use default project name when none provided', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const project = await FileManager.createProject(config);

      expect(project.projectPath).toMatch(/\/tmp\/soroban-contract-\d+-[a-z0-9]+/);
    });

    it('should handle directory creation errors', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
      };

      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValue(error);
      mockFs.rm.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);

      await expect(FileManager.createProject(config)).rejects.toThrow('Permission denied');
    });

    it('should track active projects', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const project = await FileManager.createProject(config);
      const activeProjects = FileManager.getActiveProjects();

      expect(activeProjects).toContain(project.projectPath);
    });
  });

  describe('cleanupProject', () => {
    it('should remove project directory', async () => {
      const projectPath = '/tmp/test-project-123';

      // Add to active projects first
      (FileManager as unknown as { activeProjects: Set<string> }).activeProjects.add(projectPath);

      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await FileManager.cleanupProject(projectPath);

      expect(mockFs.rm).toHaveBeenCalledWith(projectPath, {
        recursive: true,
        force: true,
      });

      const activeProjects = FileManager.getActiveProjects();
      expect(activeProjects).not.toContain(projectPath);
    });

    it('should handle non-existent directory gracefully', async () => {
      const projectPath = '/tmp/non-existent-project';

      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);

      // Should not throw
      await expect(FileManager.cleanupProject(projectPath)).resolves.toBeUndefined();
    });

    it('should propagate other filesystem errors', async () => {
      const projectPath = '/tmp/test-project';

      mockFs.access.mockResolvedValue(undefined);
      const error = new Error('Permission denied');
      mockFs.rm.mockRejectedValue(error);

      await expect(FileManager.cleanupProject(projectPath)).rejects.toThrow('Permission denied');
    });
  });

  describe('cleanupAllProjects', () => {
    it('should cleanup all active projects', async () => {
      const projects = ['/tmp/project1', '/tmp/project2', '/tmp/project3'];

      // Add projects to active set
      projects.forEach((path) =>
        (FileManager as unknown as { activeProjects: Set<string> }).activeProjects.add(path)
      );

      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await FileManager.cleanupAllProjects();

      expect(mockFs.rm).toHaveBeenCalledTimes(3);
      projects.forEach((path) => {
        expect(mockFs.rm).toHaveBeenCalledWith(path, {
          recursive: true,
          force: true,
        });
      });

      const activeProjects = FileManager.getActiveProjects();
      expect(activeProjects).toHaveLength(0);
    });

    it('should handle partial cleanup failures gracefully', async () => {
      const projects = ['/tmp/project1', '/tmp/project2'];

      projects.forEach((path) =>
        (FileManager as unknown as { activeProjects: Set<string> }).activeProjects.add(path)
      );

      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm
        .mockResolvedValueOnce(undefined) // First project succeeds
        .mockRejectedValueOnce(new Error('Cleanup failed')); // Second project fails

      // Should not throw, but handle errors gracefully
      await expect(FileManager.cleanupAllProjects()).resolves.toBeUndefined();

      const activeProjects = FileManager.getActiveProjects();
      expect(activeProjects).toHaveLength(0); // Should clear even on partial failure
    });
  });

  describe('readFile', () => {
    it('should read file content', async () => {
      const filePath = '/tmp/test-file.txt';
      const content = 'File content';

      mockFs.readFile.mockResolvedValue(content);

      const result = await FileManager.readFile(filePath);

      expect(result).toBe(content);
      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should handle read errors', async () => {
      const filePath = '/tmp/non-existent.txt';
      const error = new Error('File not found');

      mockFs.readFile.mockRejectedValue(error);

      await expect(FileManager.readFile(filePath)).rejects.toThrow(
        'Failed to read file /tmp/non-existent.txt: File not found'
      );
    });
  });

  describe('writeFile', () => {
    it('should write file content', async () => {
      const filePath = '/tmp/output.txt';
      const content = 'Content to write';

      mockFs.writeFile.mockResolvedValue(undefined);

      await FileManager.writeFile(filePath, content);

      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf8');
    });

    it('should handle write errors', async () => {
      const filePath = '/tmp/readonly.txt';
      const content = 'Content to write';
      const error = new Error('Permission denied');

      mockFs.writeFile.mockRejectedValue(error);

      await expect(FileManager.writeFile(filePath, content)).rejects.toThrow(
        'Failed to write file /tmp/readonly.txt: Permission denied'
      );
    });
  });

  describe('getActiveProjects', () => {
    it('should return list of active projects', () => {
      const projects = ['/tmp/project1', '/tmp/project2'];

      projects.forEach((path) =>
        (FileManager as unknown as { activeProjects: Set<string> }).activeProjects.add(path)
      );

      const activeProjects = FileManager.getActiveProjects();

      expect(activeProjects).toEqual(expect.arrayContaining(projects));
      expect(activeProjects).toHaveLength(2);
    });

    it('should return empty array when no active projects', () => {
      const activeProjects = FileManager.getActiveProjects();

      expect(activeProjects).toEqual([]);
    });
  });

  describe('project cleanup function', () => {
    it('should cleanup project when cleanup function is called', async () => {
      const config: ProjectConfig = {
        code: 'use soroban_sdk::*;',
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      const project = await FileManager.createProject(config);

      // Verify project is in active list
      expect(FileManager.getActiveProjects()).toContain(project.projectPath);

      // Call cleanup
      await project.cleanup();

      // Verify project was removed
      expect(mockFs.rm).toHaveBeenCalledWith(project.projectPath, {
        recursive: true,
        force: true,
      });
      expect(FileManager.getActiveProjects()).not.toContain(project.projectPath);
    });
  });
});
